const DEFAULT_AMOUNTS = [5, 10, 30, 50, 100, 300, 500];
const DEFAULT_CATEGORIES = ["Food", "Travel", "Bills", "Shopping", "Misc"];
const STORAGE_KEYS = {
  amounts: "moneyTracker.amounts",
  categories: "moneyTracker.categories",
  session: "moneyTracker.session",
};

const state = {
  amounts: loadList(STORAGE_KEYS.amounts, DEFAULT_AMOUNTS, normalizeAmountList),
  categories: loadList(STORAGE_KEYS.categories, DEFAULT_CATEGORIES, normalizeCategoryList),
  counts: {},
  selectedCategory: "",
  locationUrl: "",
  amountEditOpen: false,
  categoryEditOpen: false,
  installPrompt: null,
};

const elements = {
  totalValue: document.getElementById("totalValue"),
  selectionSummary: document.getElementById("selectionSummary"),
  selectedCategoryText: document.getElementById("selectedCategoryText"),
  amountPanelTotal: document.getElementById("amountPanelTotal"),
  amountButtons: document.getElementById("amountButtons"),
  categoryButtons: document.getElementById("categoryButtons"),
  amountEditList: document.getElementById("amountEditList"),
  categoryEditList: document.getElementById("categoryEditList"),
  amountEditor: document.getElementById("amountEditor"),
  categoryEditor: document.getElementById("categoryEditor"),
  toggleAmountEdit: document.getElementById("toggleAmountEdit"),
  toggleCategoryEdit: document.getElementById("toggleCategoryEdit"),
  amountAddForm: document.getElementById("amountAddForm"),
  categoryAddForm: document.getElementById("categoryAddForm"),
  newAmountInput: document.getElementById("newAmountInput"),
  newCategoryInput: document.getElementById("newCategoryInput"),
  clearAllButton: document.getElementById("clearAllButton"),
  fetchLocationButton: document.getElementById("fetchLocationButton"),
  copyLocationButton: document.getElementById("copyLocationButton"),
  locationOutput: document.getElementById("locationOutput"),
  locationStatus: document.getElementById("locationStatus"),
  installButton: document.getElementById("installButton"),
  rippleTemplate: document.getElementById("rippleTemplate"),
};

initializeSession();
bindEvents();
render();
registerServiceWorker();
prepareInstallFlow();
maybeAutoFetchLocation();

function bindEvents() {
  elements.clearAllButton.addEventListener("click", () => {
    state.counts = {};
    state.selectedCategory = "";
    saveSession();
    render();
    vibrate([18, 10, 18]);
  });

  elements.toggleAmountEdit.addEventListener("click", () => {
    state.amountEditOpen = !state.amountEditOpen;
    renderAmountEditor();
  });

  elements.toggleCategoryEdit.addEventListener("click", () => {
    state.categoryEditOpen = !state.categoryEditOpen;
    renderCategoryEditor();
  });

  elements.amountAddForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = Number(elements.newAmountInput.value);
    if (!Number.isFinite(value) || value <= 0) {
      elements.newAmountInput.focus();
      return;
    }

    const normalized = Math.round(value);
    if (!state.amounts.includes(normalized)) {
      state.amounts = normalizeAmountList([...state.amounts, normalized]);
      saveAmounts();
    }
    elements.newAmountInput.value = "";
    renderAmounts();
    renderAmountEditor();
  });

  elements.categoryAddForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = sanitizeCategory(elements.newCategoryInput.value);
    if (!value) {
      elements.newCategoryInput.focus();
      return;
    }

    if (!state.categories.includes(value)) {
      state.categories = normalizeCategoryList([...state.categories, value]);
      saveCategories();
    }
    elements.newCategoryInput.value = "";
    renderCategories();
    renderCategoryEditor();
  });

  elements.fetchLocationButton.addEventListener("click", fetchLocation);
  elements.copyLocationButton.addEventListener("click", copyLocation);
  elements.installButton.addEventListener("click", installApp);
}

function initializeSession() {
  const saved = safeParse(localStorage.getItem(STORAGE_KEYS.session));
  if (!saved || typeof saved !== "object") {
    return;
  }

  const counts = {};
  for (const amount of state.amounts) {
    const count = Number(saved.counts?.[amount] ?? 0);
    if (count > 0) {
      counts[amount] = Math.floor(count);
    }
  }

  state.counts = counts;
  state.selectedCategory = state.categories.includes(saved.selectedCategory) ? saved.selectedCategory : "";
}

function render() {
  renderAmounts();
  renderCategories();
  renderSummary();
  renderAmountEditor();
  renderCategoryEditor();
  updateLocationUi();
}

function renderAmounts() {
  elements.amountButtons.replaceChildren();

  if (state.amounts.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = "No amounts available. Add one in edit mode.";
    elements.amountButtons.appendChild(emptyState);
    return;
  }

  state.amounts.forEach((amount) => {
    const count = state.counts[amount] ?? 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip-button${count > 0 ? " is-selected" : ""}`;
    button.dataset.amount = String(amount);
    button.innerHTML = `
      <span class="chip-value">${formatCurrency(amount)}</span>
      ${count > 0 ? `<span class="chip-badge">×${count}</span>` : ""}
    `;
    button.addEventListener("click", () => {
      animateTap(button);
      state.counts[amount] = (state.counts[amount] ?? 0) + 1;
      saveSession();
      renderAmounts();
      renderSummary();
      vibrate(14);
    });
    elements.amountButtons.appendChild(button);
  });
}

function renderCategories() {
  elements.categoryButtons.replaceChildren();

  if (state.categories.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = "No categories available. Add one in edit mode.";
    elements.categoryButtons.appendChild(emptyState);
    return;
  }

  state.categories.forEach((category) => {
    const selected = state.selectedCategory === category;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip-button${selected ? " is-selected" : ""}`;
    button.dataset.category = category;
    button.innerHTML = `
      <span class="chip-value">${escapeHtml(category)}</span>
    `;
    button.addEventListener("click", () => {
      animateTap(button);
      state.selectedCategory = selected ? "" : category;
      saveSession();
      renderCategories();
      renderSummary();
      vibrate(10);
    });
    elements.categoryButtons.appendChild(button);
  });
}

function renderSummary() {
  const total = state.amounts.reduce((sum, amount) => sum + amount * (state.counts[amount] ?? 0), 0);
  const selectedCount = Object.values(state.counts).reduce((sum, count) => sum + count, 0);
  const activeAmountCount = countActiveAmounts();

  elements.totalValue.textContent = formatCurrency(total);
  elements.amountPanelTotal.textContent = `Selected total: ${formatCurrency(total)}`;
  elements.selectionSummary.textContent = selectedCount > 0
    ? `${selectedCount} tap${selectedCount === 1 ? "" : "s"} recorded across ${activeAmountCount} amount${activeAmountCount === 1 ? "" : "s"}.`
    : "No amounts selected yet.";
  elements.selectedCategoryText.textContent = state.selectedCategory
    ? `Category: ${state.selectedCategory}`
    : "No category selected.";
}

function renderAmountEditor() {
  elements.amountEditor.classList.toggle("hidden", !state.amountEditOpen);
  elements.amountEditor.setAttribute("aria-hidden", String(!state.amountEditOpen));
  elements.toggleAmountEdit.setAttribute("aria-expanded", String(state.amountEditOpen));
  elements.amountEditList.replaceChildren();

  if (state.amounts.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = "Add a custom amount to start building this panel.";
    elements.amountEditList.appendChild(emptyState);
    return;
  }

  state.amounts.forEach((amount) => {
    const row = document.createElement("div");
    row.className = "editor-item";

    const field = document.createElement("label");
    field.className = "field";
    field.innerHTML = `
      <span>Edit amount</span>
      <input type="number" min="0" step="1" value="${amount}" aria-label="Edit amount ${amount}">
    `;
    const input = field.querySelector("input");
    input.addEventListener("change", () => {
      updateAmount(amount, Number(input.value));
    });

    const actions = document.createElement("div");
    actions.className = "editor-row-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "ghost-button";
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", () => updateAmount(amount, Number(input.value)));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "ghost-button danger-button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => removeAmount(amount));

    actions.append(saveButton, deleteButton);
    row.append(field, actions);
    elements.amountEditList.appendChild(row);
  });
}

function renderCategoryEditor() {
  elements.categoryEditor.classList.toggle("hidden", !state.categoryEditOpen);
  elements.categoryEditor.setAttribute("aria-hidden", String(!state.categoryEditOpen));
  elements.toggleCategoryEdit.setAttribute("aria-expanded", String(state.categoryEditOpen));
  elements.categoryEditList.replaceChildren();

  if (state.categories.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = "Add a category to keep your tracker organized.";
    elements.categoryEditList.appendChild(emptyState);
    return;
  }

  state.categories.forEach((category) => {
    const row = document.createElement("div");
    row.className = "editor-item";

    const field = document.createElement("label");
    field.className = "field";
    field.innerHTML = `
      <span>Edit category</span>
      <input type="text" maxlength="24" value="${escapeAttribute(category)}" aria-label="Edit category ${escapeAttribute(category)}">
    `;
    const input = field.querySelector("input");
    input.addEventListener("change", () => {
      updateCategory(category, input.value);
    });

    const actions = document.createElement("div");
    actions.className = "editor-row-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "ghost-button";
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", () => updateCategory(category, input.value));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "ghost-button danger-button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => removeCategory(category));

    actions.append(saveButton, deleteButton);
    row.append(field, actions);
    elements.categoryEditList.appendChild(row);
  });
}

function updateAmount(previousAmount, nextAmount) {
  if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
    return;
  }

  const normalized = Math.round(nextAmount);
  if (normalized === previousAmount) {
    return;
  }

  const nextSet = state.amounts.map((amount) => (amount === previousAmount ? normalized : amount));
  state.amounts = normalizeAmountList(nextSet);

  const previousCount = state.counts[previousAmount] ?? 0;
  const existingCount = state.counts[normalized] ?? 0;
  delete state.counts[previousAmount];
  if (previousCount > 0 || existingCount > 0) {
    state.counts[normalized] = previousCount + existingCount;
  }

  saveAmounts();
  saveSession();
  render();
}

function removeAmount(amount) {
  state.amounts = state.amounts.filter((value) => value !== amount);
  delete state.counts[amount];
  saveAmounts();
  saveSession();
  render();
}

function updateCategory(previousCategory, nextCategoryRaw) {
  const normalized = sanitizeCategory(nextCategoryRaw);
  if (!normalized) {
    return;
  }

  if (normalized === previousCategory) {
    return;
  }

  state.categories = normalizeCategoryList(
    state.categories.map((category) => (category === previousCategory ? normalized : category)),
  );

  if (state.selectedCategory === previousCategory) {
    state.selectedCategory = normalized;
  }

  saveCategories();
  saveSession();
  render();
}

function removeCategory(category) {
  state.categories = state.categories.filter((value) => value !== category);
  if (state.selectedCategory === category) {
    state.selectedCategory = "";
  }
  saveCategories();
  saveSession();
  render();
}

function fetchLocation() {
  if (!("geolocation" in navigator)) {
    elements.locationStatus.textContent = "Geolocation is not supported on this device.";
    return;
  }

  elements.locationStatus.textContent = "Fetching your location...";
  elements.fetchLocationButton.disabled = true;

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      state.locationUrl = `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`;
      elements.locationStatus.textContent = "Location ready to copy.";
      elements.fetchLocationButton.disabled = false;
      updateLocationUi();
      vibrate([12, 8, 12]);
    },
    (error) => {
      const message = error.code === error.PERMISSION_DENIED
        ? "Location access was denied. Allow location permission in the browser if you want the Maps link."
        : window.isSecureContext
          ? "Unable to fetch location right now. Check GPS, browser permission, and try again."
          : "Location needs a secure context. Open the app over HTTPS or localhost to use geolocation.";
      elements.locationStatus.textContent = message;
      elements.fetchLocationButton.disabled = false;
      state.locationUrl = "";
      updateLocationUi();
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    },
  );
}

async function copyLocation() {
  if (!state.locationUrl) {
    return;
  }

  try {
    await navigator.clipboard.writeText(state.locationUrl);
    elements.locationStatus.textContent = "Location link copied.";
    vibrate(12);
  } catch (error) {
    elements.locationStatus.textContent = "Copy failed. You can still select and copy the link manually.";
  }
}

function updateLocationUi() {
  elements.locationOutput.value = state.locationUrl;
  elements.copyLocationButton.disabled = !state.locationUrl;
}

async function maybeAutoFetchLocation() {
  if (!("permissions" in navigator) || !("geolocation" in navigator)) {
    return;
  }

  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    if (status.state === "granted") {
      fetchLocation();
    }
  } catch (error) {
    // Permission querying is optional and may not be supported in every browser.
  }
}

function prepareInstallFlow() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    elements.installButton.classList.remove("hidden");
  });

  window.addEventListener("appinstalled", () => {
    state.installPrompt = null;
    elements.installButton.classList.add("hidden");
  });
}

async function installApp() {
  if (!state.installPrompt) {
    return;
  }

  state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
  elements.installButton.classList.add("hidden");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {
        // Silent failure keeps the tracker usable even if service worker registration fails.
      });
    });
  }
}

function animateTap(button) {
  const ripple = elements.rippleTemplate.content.firstElementChild.cloneNode(true);
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${rect.width / 2 - size / 2}px`;
  ripple.style.top = `${rect.height / 2 - size / 2}px`;
  button.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
}

function vibrate(pattern) {
  if ("vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

function saveAmounts() {
  localStorage.setItem(STORAGE_KEYS.amounts, JSON.stringify(state.amounts));
}

function saveCategories() {
  localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(state.categories));
}

function saveSession() {
  localStorage.setItem(STORAGE_KEYS.session, JSON.stringify({
    counts: state.counts,
    selectedCategory: state.selectedCategory,
  }));
}

function countActiveAmounts() {
  return Object.values(state.counts).filter((count) => count > 0).length;
}

function loadList(key, defaults, normalizer) {
  const raw = safeParse(localStorage.getItem(key));
  return normalizer(Array.isArray(raw) ? raw : defaults);
}

function normalizeAmountList(values) {
  return [...new Set(values.map(Number).filter((value) => Number.isFinite(value) && value > 0).map((value) => Math.round(value)))].sort((a, b) => a - b);
}

function normalizeCategoryList(values) {
  return [...new Set(values.map(sanitizeCategory).filter(Boolean))];
}

function sanitizeCategory(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
}

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value);
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
