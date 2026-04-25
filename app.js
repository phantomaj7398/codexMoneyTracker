const DEFAULT_AMOUNTS = [5, 10, 30, 50, 100, 300, 500];
const DEFAULT_CATEGORIES = ["Food", "Travel", "Bills", "Shopping", "Misc"];
const STORAGE_KEYS = {
  amounts: "moneyTracker.amounts",
  categories: "moneyTracker.categories",
  session: "moneyTracker.session",
  transactions: "moneyTracker.transactions",
};
const SHARE_DB_NAME = "moneyTrackerShareDb";
const SHARE_STORE_NAME = "sharedImages";
const SHARED_IMAGE_ID = "latest";

const state = {
  amounts: loadList(STORAGE_KEYS.amounts, DEFAULT_AMOUNTS, normalizeAmountList),
  categories: loadList(STORAGE_KEYS.categories, DEFAULT_CATEGORIES, normalizeCategoryList),
  counts: {},
  selectedCategory: "",
  locationUrl: "",
  amountEditOpen: false,
  categoryEditOpen: false,
  installPrompt: null,
  sharedTransaction: null,
  sharedImage: "",
  ocrText: "",
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
  sharedTransactionPanel: document.getElementById("sharedTransactionPanel"),
  sharedImagePreview: document.getElementById("sharedImagePreview"),
  transactionForm: document.getElementById("transactionForm"),
  transactionAmount: document.getElementById("transactionAmount"),
  transactionReceiver: document.getElementById("transactionReceiver"),
  transactionUpiId: document.getElementById("transactionUpiId"),
  transactionId: document.getElementById("transactionId"),
  transactionUtr: document.getElementById("transactionUtr"),
  transactionDatetime: document.getElementById("transactionDatetime"),
  ocrProgress: document.getElementById("ocrProgress"),
  ocrStatus: document.getElementById("ocrStatus"),
  clearSharedTransactionButton: document.getElementById("clearSharedTransactionButton"),
};

initializeSession();
bindEvents();
render();
registerServiceWorker();
prepareInstallFlow();
maybeAutoFetchLocation();
handleSharedImageFlow();

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
  elements.transactionForm.addEventListener("submit", saveSharedTransaction);
  elements.clearSharedTransactionButton.addEventListener("click", clearSharedTransaction);
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

async function handleSharedImageFlow() {
  const query = new URLSearchParams(window.location.search);
  if (!query.has("fromShare")) {
    return;
  }

  showSharedTransactionPanel();
  setOcrStatus("Loading shared image...", "Waiting");

  try {
    const sharedImage = await getSharedImage();
    if (!sharedImage?.image) {
      setOcrStatus("No shared image was found. You can try sharing the screenshot again.", "Missing", true);
      return;
    }

    state.sharedImage = sharedImage.image;
    state.sharedTransaction = createEmptyTransaction(state.sharedImage);
    elements.sharedImagePreview.src = state.sharedImage;
    fillTransactionForm(state.sharedTransaction);
    await runOcrForSharedImage(state.sharedImage);
  } catch (error) {
    setOcrStatus("The shared image could not be loaded. You can still import another screenshot.", "Error", true);
  }
}

function showSharedTransactionPanel() {
  elements.sharedTransactionPanel.classList.remove("hidden");
  elements.sharedTransactionPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function runOcrForSharedImage(image) {
  if (!window.Tesseract?.recognize) {
    setOcrStatus("OCR library is unavailable. The image is ready for manual entry.", "Manual", true);
    return;
  }

  setOcrStatus("Running OCR...", "0%");

  try {
    const result = await Tesseract.recognize(image, "eng", {
      workerPath: "vendor/tesseract/worker.min.js",
      corePath: "vendor/tesseract/tesseract-core.wasm.js",
      langPath: "vendor/tesseract",
      logger: (message) => {
        if (message.status === "recognizing text" && Number.isFinite(message.progress)) {
          setOcrStatus("Reading text from screenshot...", `${Math.round(message.progress * 100)}%`);
        }
      },
    });

    state.ocrText = result.data?.text ?? "";
    const extracted = extractTransactionData(state.ocrText, image);
    state.sharedTransaction = { ...state.sharedTransaction, ...extracted, image };
    fillTransactionForm(state.sharedTransaction);
    setOcrStatus("Review the extracted details before saving.", "Ready");
  } catch (error) {
    setOcrStatus("OCR failed. The image is still available for manual correction.", "Manual", true);
  }
}

function extractTransactionData(text, image) {
  const normalized = normalizeOcrText(text);
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const upiId = findUpiId(normalized);
  const amount = findAmount(normalized);
  const transactionId = findTransactionId(normalized);
  const utr = findUtr(normalized);
  const datetime = findDatetime(normalized);
  const receiver = findReceiver(lines, upiId);

  return {
    amount,
    receiver,
    upiId,
    transactionId,
    utr,
    datetime,
    image,
  };
}

function normalizeOcrText(text) {
  return String(text ?? "")
    .replace(/\r/g, "\n")
    .replace(/[|]/g, "I")
    .replace(/[₹]/g, "₹")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function findAmount(text) {
  const patterns = [
    /(?:₹|Rs\.?|INR)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
    /\b([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:₹|Rs\.?|INR)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return Number(match[1].replace(/,/g, ""));
    }
  }

  return 0;
}

function findUpiId(text) {
  const match = text.match(/\b[a-z0-9._-]{2,}@[a-z][a-z0-9.-]{2,}\b/i);
  return match?.[0] ?? "";
}

function findTransactionId(text) {
  const labelled = text.match(/transaction\s*(?:id|no\.?|number)?\s*[:#-]?\s*([A-Z]?\d{10,}|T[A-Z0-9]{10,})/i);
  if (labelled) {
    return labelled[1];
  }

  const fallback = text.match(/\bT[A-Z0-9]{12,}\b/i);
  return fallback?.[0] ?? "";
}

function findUtr(text) {
  const labelled = text.match(/\bUTR\s*[:#-]?\s*([0-9]{8,})\b/i);
  if (labelled) {
    return labelled[1];
  }

  const longNumbers = [...text.matchAll(/\b[0-9]{10,18}\b/g)].map((match) => match[0]);
  const transactionId = findTransactionId(text);
  return longNumbers.find((value) => !transactionId.includes(value)) ?? "";
}

function findDatetime(text) {
  const dateLine = text.match(/\b\d{1,2}[:.]\d{2}\s*(?:am|pm)?\s*(?:on)?\s*\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b/i);
  if (dateLine) {
    return dateLine[0].replace(/\s+/g, " ");
  }

  const dateFirst = text.match(/\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}[, ]+\d{1,2}[:.]\d{2}\s*(?:am|pm)?\b/i);
  return dateFirst?.[0].replace(/\s+/g, " ") ?? "";
}

function findReceiver(lines, upiId) {
  const paidToIndex = lines.findIndex((line) => /paid\s+to/i.test(line));
  if (paidToIndex >= 0) {
    for (const line of lines.slice(paidToIndex + 1, paidToIndex + 5)) {
      if (isLikelyReceiverName(line)) {
        return cleanReceiverName(line);
      }
    }
  }

  if (upiId) {
    const upiLineIndex = lines.findIndex((line) => line.includes(upiId));
    for (let index = upiLineIndex - 1; index >= Math.max(0, upiLineIndex - 3); index -= 1) {
      if (isLikelyReceiverName(lines[index])) {
        return cleanReceiverName(lines[index]);
      }
    }
  }

  return "";
}

function isLikelyReceiverName(line) {
  const cleaned = cleanReceiverName(line);
  return /^[A-Za-z][A-Za-z .'-]{2,}$/.test(cleaned)
    && !/(transaction|transfer|details|paid|debited|powered|successful|bank|utr|id)/i.test(cleaned);
}

function cleanReceiverName(line) {
  return String(line ?? "").replace(/[^A-Za-z .'-]/g, " ").replace(/\s+/g, " ").trim();
}

function fillTransactionForm(transaction) {
  elements.transactionAmount.value = transaction.amount || "";
  elements.transactionReceiver.value = transaction.receiver || "";
  elements.transactionUpiId.value = transaction.upiId || "";
  elements.transactionId.value = transaction.transactionId || "";
  elements.transactionUtr.value = transaction.utr || "";
  elements.transactionDatetime.value = transaction.datetime || "";
}

async function saveSharedTransaction(event) {
  event.preventDefault();

  const entry = {
    amount: Number(elements.transactionAmount.value) || 0,
    receiver: elements.transactionReceiver.value.trim(),
    upiId: elements.transactionUpiId.value.trim(),
    transactionId: elements.transactionId.value.trim(),
    utr: elements.transactionUtr.value.trim(),
    datetime: elements.transactionDatetime.value.trim(),
    image: state.sharedImage,
  };

  const entries = loadTransactions();
  entries.unshift(entry);
  localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(entries));
  try {
    await deleteSharedImage();
  } catch (error) {
    // The saved entry already contains the image; stale handoff data can be replaced by the next share.
  }
  state.sharedTransaction = entry;
  setOcrStatus("Transaction saved on this device.", "Saved");
  vibrate([12, 8, 12]);
}

async function clearSharedTransaction() {
  try {
    await deleteSharedImage();
  } catch (error) {
    // Dismissal should still clear the visible import panel if IndexedDB cleanup fails.
  }
  state.sharedTransaction = null;
  state.sharedImage = "";
  state.ocrText = "";
  elements.sharedTransactionPanel.classList.add("hidden");
  elements.sharedImagePreview.removeAttribute("src");
  fillTransactionForm(createEmptyTransaction(""));
  setOcrStatus("Waiting for a shared image.", "Waiting");
}

function createEmptyTransaction(image) {
  return {
    amount: 0,
    receiver: "",
    upiId: "",
    transactionId: "",
    utr: "",
    datetime: "",
    image,
  };
}

function setOcrStatus(message, progress, isError = false) {
  elements.ocrStatus.textContent = message;
  elements.ocrProgress.textContent = progress;
  elements.ocrProgress.classList.toggle("is-error", isError);
}

function loadTransactions() {
  const parsed = safeParse(localStorage.getItem(STORAGE_KEYS.transactions));
  return Array.isArray(parsed) ? parsed : [];
}

async function getSharedImage() {
  const db = await openShareDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SHARE_STORE_NAME, "readonly");
    const request = transaction.objectStore(SHARE_STORE_NAME).get(SHARED_IMAGE_ID);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteSharedImage() {
  const db = await openShareDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SHARE_STORE_NAME, "readwrite");
    const request = transaction.objectStore(SHARE_STORE_NAME).delete(SHARED_IMAGE_ID);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function openShareDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(SHARE_STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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
