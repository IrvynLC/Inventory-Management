const BUSINESS_DATA_STORAGE_KEYS = ["ims-company-data-v2", "ims-company-data-v3", "ims-company-data-v4"];
const INVENTORY_PAGE_SIZE = 8;
const SESSION_STORAGE_KEY = "ims-session-user-id-v2";
const API_DATA_ENDPOINT = "/api/data";
const API_LOGIN_ENDPOINT = "/api/login";
const API_LOGOUT_ENDPOINT = "/api/logout";
const API_SESSION_ENDPOINT = "/api/session";
const API_TIMEOUT_MS = 4000;
const PROTECTED_PAGES = new Set(["home", "inventory", "activity-history", "activity-detail", "add-stock", "draw-stock", "create-stock", "relocate-stock", "handover"]);

let currentUserCache = null;
let sessionLoadPromise = null;

const defaultData = {
  inventory: [],
  adjustments: [],
  stockOuts: [],
  corrections: [],
  relocations: []
};

let dataCache = null;

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function clearBusinessDataStorage() {
  BUSINESS_DATA_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
}

function getCurrentUser() {
  return currentUserCache;
}

function setCurrentUser(user) {
  currentUserCache = user ? { ...user } : null;
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function clearCurrentUser() {
  currentUserCache = null;
  sessionLoadPromise = null;
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

async function fetchCurrentUser() {
  if (sessionLoadPromise) return sessionLoadPromise;

  sessionLoadPromise = (async () => {
    try {
      const response = await fetchWithTimeout(API_SESSION_ENDPOINT, {
        cache: "no-store"
      });
      if (!response.ok) {
        currentUserCache = null;
        return null;
      }
      const payload = await response.json();
      currentUserCache = payload.user ? { ...payload.user } : null;
      return currentUserCache;
    } catch (error) {
      currentUserCache = null;
      return null;
    }
  })();

  return sessionLoadPromise;
}

function getCurrentPagePath() {
  const currentFile = window.location.pathname.split("/").filter(Boolean).pop() || "index.html";
  return `${currentFile}${window.location.search}${window.location.hash}`;
}

function normalizeRole(role) {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "administrator") return "admin";
  if (value === "adminstrator") return "admin";
  if (value === "adminstrative") return "administrative";
  return value;
}

function canAccessPage(page, user) {
  if (!PROTECTED_PAGES.has(page)) return true;
  if (!user) return false;

  const role = normalizeRole(user.role);
  if (["home", "inventory", "activity-history", "activity-detail", "handover"].includes(page)) {
    return true;
  }
  if (page === "relocate-stock") {
    return role === "admin";
  }
  if (["add-stock", "create-stock"].includes(page)) {
    return role !== "engineer";
  }
  if (page === "draw-stock") {
    return role !== "admin";
  }

  return true;
}

function getCorrectionPermissionLabel(correctionKind) {
  if (["create", "stock-in"].includes(correctionKind)) {
    return "Admin or Administrative";
  }
  if (correctionKind === "stock-out") {
    return "Engineer or Administrative";
  }
  return "Administrative";
}

function canCorrectActivityKind(correctionKind, user) {
  if (!user) return false;

  const role = normalizeRole(user.role);
  if (role === "administrative") return true;
  if (["create", "stock-in"].includes(correctionKind)) return role === "admin";
  if (correctionKind === "stock-out") return role === "engineer";
  return false;
}

function canCorrectActivityRecord(record, user) {
  const correctionKind = getCorrectableRecordKind(record);
  return ["create", "stock-in", "stock-out"].includes(correctionKind)
    && canCorrectActivityKind(correctionKind, user);
}

function canAccessHref(href, user) {
  const fileName = String(href || "").split("#")[0].split("?")[0] || "index.html";
  const pageByFile = {
    "index.html": "home",
    "inventory.html": "inventory",
    "activity-history.html": "activity-history",
    "activity-detail.html": "activity-detail",
    "handover.html": "handover",
    "add-stock.html": "add-stock",
    "create-stock.html": "create-stock",
    "relocate-stock.html": "relocate-stock",
    "draw-stock.html": "draw-stock"
  };

  return canAccessPage(pageByFile[fileName] || "", user);
}

function redirectToLogin() {
  const next = encodeURIComponent(getCurrentPagePath());
  window.location.replace(`login.html?next=${next}`);
}

function redirectAfterLogin() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  const safeNext = next && !next.includes("://") && !next.startsWith("//")
    ? next
    : "index.html";
  window.location.replace(safeNext);
}

async function ensureAuthenticatedSession() {
  const currentUser = await fetchCurrentUser();
  const page = document.body.dataset.page;

  if (PROTECTED_PAGES.has(page) && !currentUser) {
    redirectToLogin();
    return null;
  }

  if (PROTECTED_PAGES.has(page) && !canAccessPage(page, currentUser)) {
    window.location.replace("index.html");
    return null;
  }

  return currentUser;
}

function getUserDisplayName(user) {
  if (!user) return "Unknown User";
  return user.name || user.username || "Unknown User";
}

function getUserRole(user) {
  return user?.role || "Inventory User";
}

function buildUserStamp(user) {
  return {
    createdByUserId: user?.id ?? null,
    createdByName: getUserDisplayName(user),
    lastUpdatedByUserId: user?.id ?? null,
    lastUpdatedByName: getUserDisplayName(user)
  };
}

function hasOwnValue(object, key) {
  return Object.prototype.hasOwnProperty.call(Object(object), key);
}

function getDefaultConsignmentQuantity() {
  return 0;
}

function normalizeStockCondition(value) {
  const condition = String(value ?? "").trim().toLowerCase();
  if (["used", "use", "yes", "y", "true", "1"].includes(condition)) return "used";
  return "new";
}

function formatStockConditionLabel(value) {
  return normalizeStockCondition(value) === "used" ? "Used" : "New Stock";
}

function renderStockConditionBadge(value) {
  const condition = normalizeStockCondition(value);
  if (condition !== "used") return "";
  return `<span class="stock-condition-badge stock-condition-badge-${condition}">${escapeHtml(formatStockConditionLabel(condition))}</span>`;
}

function normalizeInternalFlag(value) {
  const flag = String(value ?? "").trim().toUpperCase();
  if (["Y", "YES", "TRUE", "1"].includes(flag)) return "Y";
  if (flag === "P") return "P";
  return "N";
}

function isInternalStock(value) {
  return normalizeInternalFlag(value) === "Y";
}

function formatInternalStockLabel(value) {
  const flag = normalizeInternalFlag(value);
  if (flag === "Y") return "Internal";
  if (flag === "P") return "P";
  return "No";
}

function renderInternalStockBadge(value) {
  const flag = normalizeInternalFlag(value);
  const className = flag === "Y" ? "internal" : flag === "P" ? "pending" : "external";
  return `<span class="stock-internal-badge stock-internal-badge-${className}">${escapeHtml(formatInternalStockLabel(flag))}</span>`;
}

function normalizeInventoryRecord(item) {
  const createdAt = item.createdAt ?? new Date().toISOString();
  const createdByName = item.createdByName ?? item.createdBy?.name ?? "System Seed";
  const createdByUserId = item.createdByUserId ?? item.createdBy?.userId ?? null;
  const lastUpdatedAt = item.lastUpdatedAt ?? item.updatedAt ?? createdAt;
  const lastUpdatedByName = item.lastUpdatedByName ?? item.updatedByName ?? createdByName;
  const lastUpdatedByUserId = item.lastUpdatedByUserId ?? item.updatedByUserId ?? createdByUserId;
  const defaultConsignment = getDefaultConsignmentQuantity(item.sku);
  const hasConsignmentFields = hasOwnValue(item, "consignmentQuantity") || hasOwnValue(item, "consignmentBaseline");
  const legacyQuantity = Number(item.quantity ?? 0);
  const ownQuantity = Math.max(Number(item.ownQuantity ?? legacyQuantity), 0);
  let consignmentQuantity = Math.max(Number(item.consignmentQuantity ?? (hasConsignmentFields ? 0 : defaultConsignment)), 0);
  let consignmentBaseline = Math.max(Number(item.consignmentBaseline ?? consignmentQuantity), 0);
  if (defaultConsignment > consignmentBaseline) {
    const topUp = defaultConsignment - consignmentBaseline;
    consignmentBaseline = defaultConsignment;
    consignmentQuantity += topUp;
  }
  const quantity = ownQuantity + consignmentQuantity;

  return {
    ...item,
    brand: item.brand ?? "Generic",
    model: item.model ?? "Standard",
    quantity,
    ownQuantity,
    consignmentQuantity,
    consignmentBaseline,
    stockCondition: normalizeStockCondition(item.stockCondition ?? item.condition ?? item.isUsedStock),
    internalFlag: normalizeInternalFlag(item.internalFlag ?? item.internal ?? item.isInternalStock),
    isInternalStock: isInternalStock(item.internalFlag ?? item.internal ?? item.isInternalStock),
    location: item.location ?? "Main Store",
    reorderLevel: item.reorderLevel ?? 0,
    createdAt,
    createdByName,
    createdByUserId,
    lastUpdatedAt,
    lastUpdatedByName,
    lastUpdatedByUserId
  };
}

function syncInventoryTotals(item) {
  item.ownQuantity = Math.max(Number(item.ownQuantity ?? item.quantity ?? 0), 0);
  item.consignmentQuantity = Math.max(Number(item.consignmentQuantity ?? 0), 0);
  item.consignmentBaseline = Math.max(Number(item.consignmentBaseline ?? item.consignmentQuantity ?? 0), 0);
  item.quantity = item.ownQuantity + item.consignmentQuantity;
  return item;
}

function getConsignmentUsed(item) {
  return Math.max(Number(item.consignmentBaseline ?? 0) - Number(item.consignmentQuantity ?? 0), 0);
}

function formatStockBreakdown(item) {
  const own = Number(item.ownQuantity ?? item.quantity ?? 0);
  const consignment = Number(item.consignmentQuantity ?? 0);
  const total = Number(item.quantity ?? own + consignment);
  const restock = getConsignmentUsed(item);
  if (!consignment && !Number(item.consignmentBaseline ?? 0)) {
    return `LC Stock ${own}`;
  }
  return `Total ${total} | LC Stock ${own} | Consignment ${consignment}${restock ? ` (${restock} to restock)` : ""}`;
}

function renderStockBreakdownChips(item) {
  const own = Number(item.ownQuantity ?? item.quantity ?? 0);
  const consignment = Number(item.consignmentQuantity ?? 0);
  const total = Number(item.quantity ?? own + consignment);
  const hasConsignment = consignment > 0 || Number(item.consignmentBaseline ?? 0) > 0;
  if (!hasConsignment) {
    return `
      <div class="stock-breakdown-display stock-breakdown-display-single" aria-label="${escapeHtml(formatStockBreakdown(item))}">
        <div class="stock-breakdown-split">
          <span class="inline-stock-chip inline-stock-chip-own">
            <span class="inline-stock-chip-label">LC Stock</span>
            <strong>${own}</strong>
          </span>
        </div>
      </div>
    `;
  }
  return `
    <div class="stock-breakdown-display" aria-label="${escapeHtml(formatStockBreakdown(item))}">
      <div class="stock-breakdown-total">
        <span class="inline-stock-chip inline-stock-chip-total">
          <span class="inline-stock-chip-label">Total</span>
          <strong>${total}</strong>
        </span>
      </div>
      <div class="stock-breakdown-split">
        <span class="inline-stock-chip inline-stock-chip-own">
          <span class="inline-stock-chip-label">LC Stock</span>
          <strong>${own}</strong>
        </span>
        ${hasConsignment ? `
          <span class="inline-stock-chip inline-stock-chip-consign">
            <span class="inline-stock-chip-label">Consignment</span>
            <strong>${consignment}</strong>
          </span>
        ` : ""}
      </div>
    </div>
  `;
}

function renderStockSnapshotChips(snapshot) {
  if (!snapshot) return "-";
  const own = Number(snapshot.ownQuantity ?? 0);
  const consignment = Number(snapshot.consignmentQuantity ?? 0);
  const total = Number(snapshot.quantity ?? own + consignment);
  const hasConsignment = consignment > 0 || Number(snapshot.consignmentBaseline ?? 0) > 0;
  if (!hasConsignment) {
    return `
      <div class="stock-breakdown-display stock-breakdown-display-single">
        <div class="stock-breakdown-split">
          <span class="inline-stock-chip inline-stock-chip-own">
            <span class="inline-stock-chip-label">LC Stock</span>
            <strong>${own}</strong>
          </span>
        </div>
      </div>
    `;
  }
  return `
    <div class="stock-breakdown-display">
      <div class="stock-breakdown-total">
        <span class="inline-stock-chip inline-stock-chip-total">
          <span class="inline-stock-chip-label">Total</span>
          <strong>${total}</strong>
        </span>
      </div>
      <div class="stock-breakdown-split">
        <span class="inline-stock-chip inline-stock-chip-own">
          <span class="inline-stock-chip-label">LC Stock</span>
          <strong>${own}</strong>
        </span>
        <span class="inline-stock-chip inline-stock-chip-consign">
          <span class="inline-stock-chip-label">Consignment</span>
          <strong>${consignment}</strong>
        </span>
      </div>
    </div>
  `;
}

function renderBalanceAuditState(snapshot, label) {
  if (!snapshot) {
    return `
      <div class="balance-state-card">
        <span class="stock-balance-audit-label">${escapeHtml(label)}</span>
        <div class="balance-state-unavailable">Not captured</div>
      </div>
    `;
  }

  return `
    <div class="balance-state-card">
      <span class="stock-balance-audit-label">${escapeHtml(label)}</span>
      ${renderStockSnapshotChips(snapshot)}
    </div>
  `;
}

function renderBalanceDelta(before, after) {
  if (!before || !after) return "";
  const totalDelta = Number(after.quantity ?? 0) - Number(before.quantity ?? 0);
  const ownDelta = Number(after.ownQuantity ?? 0) - Number(before.ownQuantity ?? 0);
  const consignmentDelta = Number(after.consignmentQuantity ?? 0) - Number(before.consignmentQuantity ?? 0);
  const parts = [];
  const formatDelta = (value) => `${value > 0 ? "+" : ""}${value}`;
  if (ownDelta) parts.push(`LC Stock ${formatDelta(ownDelta)}`);
  if (consignmentDelta) parts.push(`Consignment ${formatDelta(consignmentDelta)}`);
  if (!parts.length && totalDelta) parts.push(`Total ${formatDelta(totalDelta)}`);
  const movementLabel = [ownDelta, consignmentDelta, totalDelta].some((delta) => delta < 0)
    ? "Drawn"
    : "Added";
  return parts.length
    ? `<div class="balance-delta-pill ${movementLabel === "Drawn" ? "balance-delta-pill-negative" : ""}">${movementLabel} ${escapeHtml(parts.join(" / "))}</div>`
    : "";
}

function renderInventoryBalanceCell(item) {
  const total = Number(item.quantity ?? 0);
  const own = Number(item.ownQuantity ?? item.quantity ?? 0);
  const consignment = Number(item.consignmentQuantity ?? 0);
  const hasConsign = consignment > 0 || Number(item.consignmentBaseline ?? 0) > 0;
  const splitMarkup = hasConsign
    ? `
      <div class="stock-split" aria-label="Stock ownership split">
        <span class="stock-chip stock-chip-own">LC Stock <strong>${own}</strong></span>
        <span class="stock-chip stock-chip-consign">Consignment <strong>${consignment}</strong></span>
      </div>
    `
    : "";

  return `
    <div class="stock-balance-cell${hasConsign ? "" : " stock-balance-cell-single"}">
      <div class="stock-total">
        <strong>${total}</strong>
        <span>${escapeHtml(item.unit ?? "units")} total</span>
      </div>
      ${splitMarkup}
    </div>
  `;
}

function renderConsignmentRestockCell(item) {
  return `
    <div class="location-stack">
      <span>${escapeHtml(item.location ?? "Main Store")}</span>
    </div>
  `;
}

function getReceivingPurposeLabel(purpose) {
  if (purpose === "consignment") return "Consignment Stock";
  return "LC Stock";
}

function formatStockPurposeLabel(purpose) {
  if (purpose === "consignment") return "Consignment";
  return "LC Stock";
}

function calculateStockInAllocation(item, quantity, purpose = "own") {
  const receivedQuantity = Math.max(Number(quantity || 0), 0);
  const consignmentShortfall = item ? getConsignmentUsed(item) : 0;

  if (purpose === "consignment") {
    return {
      ownQuantity: 0,
      consignmentQuantity: receivedQuantity,
      consignmentShortfall,
      extraConsignmentQuantity: consignmentShortfall ? Math.max(receivedQuantity - consignmentShortfall, 0) : 0
    };
  }

  return {
    ownQuantity: receivedQuantity,
    consignmentQuantity: 0,
    consignmentShortfall,
    extraConsignmentQuantity: 0
  };
}

function formatStockInAllocation(item, quantity, purpose = "own") {
  const allocation = calculateStockInAllocation(item, quantity, purpose);
  const parts = [];
  if (allocation.consignmentQuantity > 0) {
    parts.push(`${allocation.consignmentQuantity} to consignment`);
  }
  if (allocation.ownQuantity > 0) {
    parts.push(`${allocation.ownQuantity} to LC Stock`);
  }
  if (!parts.length) return "No quantity allocated";

  const warning = allocation.extraConsignmentQuantity > 0
    ? ` (${allocation.extraConsignmentQuantity} above current consignment restock need)`
    : "";
  return `${parts.join(" | ")}${warning}`;
}

function renderStockInAllocationChips(item, quantity, purpose = "own") {
  const allocation = calculateStockInAllocation(item, quantity, purpose);
  const chips = [];

  if (allocation.consignmentQuantity > 0) {
    chips.push(`<span class="inline-stock-chip inline-stock-chip-consign">Consignment</span>`);
  }
  if (allocation.ownQuantity > 0) {
    chips.push(`<span class="inline-stock-chip inline-stock-chip-own">LC Stock</span>`);
  }
  if (allocation.extraConsignmentQuantity > 0) {
    chips.push(`<span class="inline-stock-chip inline-stock-chip-alert">Extra consignment <strong>${allocation.extraConsignmentQuantity}</strong></span>`);
  }
  if (!chips.length) {
    chips.push(`<span class="inline-stock-chip inline-stock-chip-total">None <strong>0</strong></span>`);
  }

  const restockQuantity = item ? getConsignmentUsed(item) : 0;
  const restockChip = restockQuantity > 0
    ? `<span class="inline-stock-chip inline-stock-chip-alert">Restock needed <strong>${restockQuantity}</strong></span>`
    : "";

  return `
    <div class="stock-allocation-cell">
      <div class="stock-allocation-chips">${chips.join("")}${restockChip}</div>
    </div>
  `;
}

function formatLineItemCount(count) {
  return `${count} line item${count === 1 ? "" : "s"}`;
}

function calculateStockOutAllocation(item, quantity) {
  const issueQuantity = Math.max(Number(quantity || 0), 0);
  const lcAvailable = Math.max(Number(item?.ownQuantity ?? item?.quantity ?? 0), 0);
  const consignmentAvailable = Math.max(Number(item?.consignmentQuantity ?? 0), 0);
  const lcQuantity = Math.min(issueQuantity, lcAvailable);
  const consignmentQuantity = Math.min(Math.max(issueQuantity - lcQuantity, 0), consignmentAvailable);
  return {
    lcQuantity,
    consignmentQuantity,
    remainingShortfall: Math.max(issueQuantity - lcQuantity - consignmentQuantity, 0)
  };
}

function renderConsignmentDrawNotice(item, quantity) {
  const allocation = calculateStockOutAllocation(item, quantity);
  if (allocation.consignmentQuantity <= 0) return "";

  return `${allocation.consignmentQuantity} from consignment`;
}

function createItemSnapshot(item) {
  return {
    brand: item.brand,
    model: item.model,
    name: item.name,
    sku: item.sku,
    unit: item.unit,
    location: item.location,
    ownQuantity: item.ownQuantity,
    consignmentQuantity: item.consignmentQuantity,
    consignmentBaseline: item.consignmentBaseline,
    consignmentToRestock: getConsignmentUsed(item),
    quantity: item.quantity
  };
}

function normalizeAdjustmentRecord(entry) {
  return {
    ...entry,
    actorName: entry.actorName ?? entry.createdByName ?? entry.createdBy?.name ?? "Unknown User",
    actorUserId: entry.actorUserId ?? entry.createdByUserId ?? entry.createdBy?.userId ?? null
  };
}

function normalizeStockOutRecord(entry) {
  return {
    ...entry,
    createdByName: entry.createdByName ?? entry.createdBy?.name ?? "Unknown User",
    createdByUserId: entry.createdByUserId ?? entry.createdBy?.userId ?? null
  };
}

function normalizeCorrectionRecord(entry) {
  return {
    ...entry,
    actorName: entry.actorName ?? entry.createdByName ?? entry.createdBy?.name ?? "Unknown User",
    actorUserId: entry.actorUserId ?? entry.createdByUserId ?? entry.createdBy?.userId ?? null,
    itemRows: entry.itemRows ?? []
  };
}

function normalizeRelocationRecord(entry) {
  return {
    ...entry,
    actorName: entry.actorName ?? entry.createdByName ?? entry.createdBy?.name ?? "Unknown User",
    actorUserId: entry.actorUserId ?? entry.createdByUserId ?? entry.createdBy?.userId ?? null,
    itemSnapshot: entry.itemSnapshot ?? null,
    fromLocation: entry.fromLocation ?? entry.previousLocation ?? "-",
    toLocation: entry.toLocation ?? entry.location ?? "-",
    remarks: entry.remarks ?? ""
  };
}

function upgradeLegacyInventory(inventory) {
  return inventory.map((item) => normalizeInventoryRecord(item));
}

function getNormalizedDefaultData(loadError = "") {
  return {
    inventory: defaultData.inventory.map((item) => normalizeInventoryRecord(item)),
    adjustments: [],
    stockOuts: [],
    corrections: [],
    relocations: [],
    ...(loadError ? { loadError } : {})
  };
}

function setDataCache(data, loadError = "") {
  dataCache = normalizeDataObject(data);
  if (loadError) {
    dataCache.loadError = loadError;
  }
  return cloneData(dataCache);
}

function normalizeDataObject(data) {
  return {
    inventory: upgradeLegacyInventory(data?.inventory ?? []),
    adjustments: (data?.adjustments ?? []).map((entry) => normalizeAdjustmentRecord(entry)),
    stockOuts: (data?.stockOuts ?? []).map((entry) => normalizeStockOutRecord(entry)),
    corrections: (data?.corrections ?? []).map((entry) => normalizeCorrectionRecord(entry)),
    relocations: (data?.relocations ?? []).map((entry) => normalizeRelocationRecord(entry))
  };
}

function loadData() {
  clearBusinessDataStorage();
  if (!dataCache) {
    dataCache = getNormalizedDefaultData("Backend data has not loaded yet.");
  }
  return cloneData(dataCache);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      credentials: options.credentials ?? "same-origin",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function persistDataToBackend(data) {
  const response = await fetchWithTimeout(API_DATA_ENDPOINT, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ data })
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearCurrentUser();
      redirectToLogin();
    }
    const error = new Error(`Backend save failed with HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
}

async function sendBackendAction(action, payload) {
  const response = await fetchWithTimeout(`/api/actions/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (response.status === 401) {
    clearCurrentUser();
    redirectToLogin();
    throw new Error("Your session expired. Please sign in again.");
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(result.error || `Backend action failed with HTTP ${response.status}`);
  }

  if (result.data) {
    const normalized = setDataCache(result.data);
    backendSyncAvailable = true;
    return { ...result, data: normalized };
  }

  return result;
}

let backendLoadPromise = null;
let backendSyncAvailable = true;

function initializeBackendData() {
  if (backendLoadPromise) return backendLoadPromise;

  backendLoadPromise = (async () => {
    clearBusinessDataStorage();

    try {
      const response = await fetchWithTimeout(API_DATA_ENDPOINT, { cache: "no-store" });
      if (!response.ok) {
        if (response.status === 401) {
          clearCurrentUser();
          redirectToLogin();
        }
        const error = new Error(`Backend returned HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const payload = await response.json();
      const activeData = setDataCache(payload.data ?? payload);
      backendSyncAvailable = true;
      return activeData;
    } catch (error) {
      backendSyncAvailable = false;
      console.warn("Backend sync is unavailable. Business data was not loaded from localStorage:", error);
      return setDataCache(getNormalizedDefaultData(error.message), error.message);
    }
  })();

  return backendLoadPromise;
}

function saveData(data) {
  const normalized = normalizeDataObject(data);

  if (backendSyncAvailable) {
    const syncPromise = persistDataToBackend(normalized);
    return syncPromise
      .then(() => setDataCache(normalized))
      .catch((error) => {
        backendSyncAvailable = false;
        console.warn("Inventory changes were not saved because backend sync is unavailable:", error);
        showToast("Server unavailable. Inventory changes were not saved. Ask IT to check the server.", "error");
        throw error;
      });
  }

  const error = new Error("Backend sync is unavailable. Inventory changes were not saved.");
  showToast("Server unavailable. Inventory changes were not saved. Ask IT to check the server.", "error");
  return Promise.reject(error);
}

function getStoredInventoryDiagnostics() {
  return {
    hasStorage: false,
    rawLength: 0,
    inventoryCount: Array.isArray(dataCache?.inventory) ? dataCache.inventory.length : 0,
    parseError: ""
  };
}

function resetInventoryViewState() {
  [
    "ims-inventory-page",
    "ims-inventory-search",
    "ims-inventory-filter",
    "ims-inventory-brand-filter",
    "ims-inventory-model-filter",
    "ims-inventory-location-filter",
    "ims-inventory-condition-filter"
  ].forEach((key) => localStorage.removeItem(key));
  localStorage.setItem("ims-inventory-page", "1");
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createNotice(message, variant = "") {
  const notice = document.createElement("div");
  notice.className = ["notice", variant ? `notice-${variant}` : ""].filter(Boolean).join(" ");
  notice.textContent = message;
  return notice;
}

function showNotice(target, message, variant = "") {
  const existing = target.querySelector(".notice");
  if (existing) existing.remove();
  target.prepend(createNotice(message, variant));
}

function showToast(message, variant = "success") {
  const existing = document.querySelector(".toast-notice");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast-notice toast-notice-${variant}`;
  toast.setAttribute("role", "status");
  toast.innerHTML = `
    <span class="toast-notice-icon" aria-hidden="true">✓</span>
    <span>${escapeHtml(message)}</span>
  `;
  document.body.append(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));

  setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 220);
  }, 3600);
}

function queueToast(message, variant = "success") {
  sessionStorage.setItem("ims-flash-toast", JSON.stringify({ message, variant }));
}

function showQueuedToast() {
  const rawToast = sessionStorage.getItem("ims-flash-toast");
  if (!rawToast) return;
  sessionStorage.removeItem("ims-flash-toast");
  try {
    const toast = JSON.parse(rawToast);
    if (toast?.message) showToast(toast.message, toast.variant ?? "success");
  } catch (error) {
    showToast(rawToast);
  }
}

function showStockInConfirmationDialog(lines) {
  return new Promise((resolve) => {
    const totalQuantity = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const totalLineItems = lines.length;
    const lcLines = lines.filter((line) => line.receivingPurpose === "own");
    const consignmentLines = lines.filter((line) => line.receivingPurpose === "consignment");
    const lcQuantity = lines
      .filter((line) => line.receivingPurpose === "own")
      .reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const consignmentQuantity = lines
      .filter((line) => line.receivingPurpose === "consignment")
      .reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const renderSection = (title, sectionLines, variant) => `
      <section class="confirm-category-section confirm-category-${variant}">
        <div class="confirm-category-header">
          <h4>${escapeHtml(title)}</h4>
          <span>${sectionLines.length} item line${sectionLines.length === 1 ? "" : "s"}</span>
        </div>
        ${sectionLines.length
          ? `<div class="confirm-line-list">
              ${sectionLines.map((line) => `
                <div class="confirm-line-item">
                  <div>
                    <strong>${escapeHtml(line.name)}</strong>
                    <span>${escapeHtml(line.sku)} | ${escapeHtml(line.brand)} / ${escapeHtml(line.model)}</span>
                  </div>
                  <div class="confirm-line-result">
                    <span class="inline-stock-chip ${variant === "consignment" ? "inline-stock-chip-consign" : "inline-stock-chip-own"}">
                      Qty <strong>${escapeHtml(String(line.quantity))}</strong>
                    </span>
                  </div>
                </div>
              `).join("")}
            </div>`
          : `<div class="confirm-empty-category">No items selected for this category.</div>`}
      </section>
    `;
    const modal = document.createElement("div");
    modal.className = "confirm-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "stock-in-confirm-title");
    modal.innerHTML = `
      <div class="confirm-modal-backdrop" data-confirm-cancel></div>
      <div class="confirm-dialog stock-in-confirm-dialog">
        <div class="confirm-dialog-header">
          <div>
            <p class="eyebrow">Review Stock In</p>
            <h3 id="stock-in-confirm-title">Confirm stock category</h3>
            <p class="section-copy">Check each item before updating inventory balances.</p>
          </div>
        </div>
        <div class="confirm-summary-grid" aria-label="Stock in summary">
          <div class="confirm-summary-card"><strong>${totalLineItems}</strong><span>Total line item</span></div>
          <div class="confirm-summary-card"><strong>${lcQuantity}</strong><span>To LC Stock</span></div>
          <div class="confirm-summary-card"><strong>${consignmentQuantity}</strong><span>To consignment</span></div>
        </div>
        <div class="confirm-category-grid">
          ${renderSection("Adding to LC Stock", lcLines, "lc")}
          ${renderSection("Adding to Consignment Stock", consignmentLines, "consignment")}
        </div>
        <div class="confirm-dialog-actions">
          <button type="button" class="button-link" data-confirm-cancel>Review Again</button>
          <button type="button" class="button-primary" data-confirm-submit>Confirm Add Stock</button>
        </div>
      </div>
    `;

    const close = (confirmed) => {
      document.removeEventListener("keydown", handleKeydown);
      modal.classList.remove("is-open");
      setTimeout(() => modal.remove(), 180);
      document.body.classList.remove("modal-open");
      resolve(confirmed);
    };

    document.body.append(modal);
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => modal.classList.add("is-open"));
    modal.querySelector("[data-confirm-submit]")?.focus();

    modal.querySelectorAll("[data-confirm-cancel]").forEach((element) => {
      element.addEventListener("click", () => close(false));
    });
    modal.querySelector("[data-confirm-submit]")?.addEventListener("click", () => close(true));

    function handleKeydown(event) {
      if (event.key === "Escape") {
        close(false);
      }
    }
    document.addEventListener("keydown", handleKeydown);
  });
}

function showStockOutConfirmationDialog(lines, details) {
  return new Promise((resolve) => {
    const lcQuantity = lines
      .filter((line) => line.issueSource === "own")
      .reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const consignmentQuantity = lines
      .filter((line) => line.issueSource === "consignment")
      .reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const totalQuantity = lcQuantity + consignmentQuantity;
    const modal = document.createElement("div");
    modal.className = "confirm-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "stock-out-confirm-title");
    modal.innerHTML = `
      <div class="confirm-modal-backdrop" data-confirm-cancel></div>
      <div class="confirm-dialog stock-in-confirm-dialog">
        <div class="confirm-dialog-header">
          <div>
            <p class="eyebrow">Review Stock Out</p>
            <h3 id="stock-out-confirm-title">Confirm stock withdrawal</h3>
            <p class="section-copy">Check the issue lines and receiver details before updating inventory balances.</p>
          </div>
        </div>
        <div class="confirm-summary-grid" aria-label="Stock out summary">
          <div class="confirm-summary-card"><strong>${lines.length}</strong><span>Line items</span></div>
          <div class="confirm-summary-card"><strong>${totalQuantity}</strong><span>Total issue qty</span></div>
          <div class="confirm-summary-card"><strong>${consignmentQuantity}</strong><span>From consignment</span></div>
        </div>
        <section class="confirm-category-section confirm-category-lc">
          <div class="confirm-category-header">
            <h4>${escapeHtml(details.projectTitle || "Stock withdrawal")}</h4>
            <span>Received by ${escapeHtml(details.receivedBy || "-")}</span>
          </div>
          <div class="confirm-line-list">
            ${lines.map((line) => `
              <div class="confirm-line-item">
                <div>
                  <strong>${escapeHtml(line.name)}</strong>
                  <span>${escapeHtml(line.sku)} | ${escapeHtml(line.brand)} / ${escapeHtml(line.model)}</span>
                </div>
                <div class="confirm-line-result">
                  <span class="inline-stock-chip ${line.issueSource === "consignment" ? "inline-stock-chip-consign" : "inline-stock-chip-own"}">
                    ${escapeHtml(formatStockPurposeLabel(line.issueSource))} <strong>${escapeHtml(String(line.quantity))}</strong>
                  </span>
                </div>
              </div>
            `).join("")}
          </div>
        </section>
        <div class="confirm-dialog-actions">
          <button type="button" class="button-link" data-confirm-cancel>Review Again</button>
          <button type="button" class="button-primary" data-confirm-submit>Confirm Withdraw Stock</button>
        </div>
      </div>
    `;

    const close = (confirmed) => {
      document.removeEventListener("keydown", handleKeydown);
      modal.classList.remove("is-open");
      setTimeout(() => modal.remove(), 180);
      document.body.classList.remove("modal-open");
      resolve(confirmed);
    };

    document.body.append(modal);
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => modal.classList.add("is-open"));
    modal.querySelector("[data-confirm-submit]")?.focus();

    modal.querySelectorAll("[data-confirm-cancel]").forEach((element) => {
      element.addEventListener("click", () => close(false));
    });
    modal.querySelector("[data-confirm-submit]")?.addEventListener("click", () => close(true));

    function handleKeydown(event) {
      if (event.key === "Escape") {
        close(false);
      }
    }
    document.addEventListener("keydown", handleKeydown);
  });
}

function showCreateStockConfirmationDialog(item) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "confirm-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "create-stock-confirm-title");
    modal.innerHTML = `
      <div class="confirm-modal-backdrop" data-confirm-cancel></div>
      <div class="confirm-dialog create-stock-confirm-dialog">
        <div class="confirm-dialog-header">
          <div>
            <p class="eyebrow">Review New Stock</p>
            <h3 id="create-stock-confirm-title">Confirm new inventory item</h3>
            <p class="section-copy">Check the master item details before creating the stock record.</p>
          </div>
        </div>
        <section class="create-review-card" aria-label="New item details">
          <div class="create-review-header">
            <div>
              <span class="create-review-kicker">Item description</span>
              <h4>${escapeHtml(item.name)}</h4>
            </div>
            <span class="create-review-location">${escapeHtml(item.location)}</span>
          </div>
          <div class="create-review-grid">
            <div class="create-review-field">
              <span>Stock code</span>
              <strong>${escapeHtml(item.sku)}</strong>
            </div>
            <div class="create-review-field">
              <span>Unit</span>
              <strong>${escapeHtml(item.unit)}</strong>
            </div>
            <div class="create-review-field">
              <span>LC Stock</span>
              <strong>${escapeHtml(String(Number(item.ownQuantity ?? 0)))}</strong>
            </div>
            <div class="create-review-field">
              <span>Consignment Stock</span>
              <strong>${escapeHtml(String(Number(item.consignmentQuantity ?? 0)))}</strong>
            </div>
            <div class="create-review-field">
              <span>Condition</span>
              <strong>${escapeHtml(formatStockConditionLabel(item.stockCondition))}</strong>
            </div>
            <div class="create-review-field">
              <span>Brand</span>
              <strong>${escapeHtml(item.brand)}</strong>
            </div>
            <div class="create-review-field">
              <span>Category</span>
              <strong>${escapeHtml(item.model)}</strong>
            </div>
            <div class="create-review-field">
              <span>Location</span>
              <strong>${escapeHtml(item.location)}</strong>
            </div>
          </div>
        </section>
        <div class="confirm-dialog-actions">
          <button type="button" class="button-link" data-confirm-cancel>Review Again</button>
          <button type="button" class="button-primary" data-confirm-submit>Confirm Save Item</button>
        </div>
      </div>
    `;

    const close = (confirmed) => {
      document.removeEventListener("keydown", handleKeydown);
      modal.classList.remove("is-open");
      setTimeout(() => modal.remove(), 180);
      document.body.classList.remove("modal-open");
      resolve(confirmed);
    };

    document.body.append(modal);
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => modal.classList.add("is-open"));
    modal.querySelector("[data-confirm-submit]")?.focus();

    modal.querySelectorAll("[data-confirm-cancel]").forEach((element) => {
      element.addEventListener("click", () => close(false));
    });
    modal.querySelector("[data-confirm-submit]")?.addEventListener("click", () => close(true));

    function handleKeydown(event) {
      if (event.key === "Escape") {
        close(false);
      }
    }
    document.addEventListener("keydown", handleKeydown);
  });
}

function showRelocateStockConfirmationDialog(details) {
  return new Promise((resolve) => {
    const item = details.item;
    const modal = document.createElement("div");
    modal.className = "confirm-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "relocate-stock-confirm-title");
    modal.innerHTML = `
      <div class="confirm-modal-backdrop" data-confirm-cancel></div>
      <div class="confirm-dialog create-stock-confirm-dialog">
        <div class="confirm-dialog-header">
          <div>
            <p class="eyebrow">Review Relocation</p>
            <h3 id="relocate-stock-confirm-title">Confirm stock relocation</h3>
            <p class="section-copy">Check the item and storage locations before saving this warehouse movement.</p>
          </div>
        </div>
        <section class="create-review-card" aria-label="Relocation details">
          <div class="create-review-header">
            <div>
              <span class="create-review-kicker">Item description</span>
              <h4>${escapeHtml(item.name ?? item.sku ?? "Inventory item")}</h4>
            </div>
            <span class="create-review-location">${escapeHtml(item.sku ?? "-")}</span>
          </div>
          <div class="create-review-grid">
            <div class="create-review-field">
              <span>Brand</span>
              <strong>${escapeHtml(item.brand ?? "Generic")}</strong>
            </div>
            <div class="create-review-field">
              <span>Category</span>
              <strong>${escapeHtml(item.model ?? "Standard")}</strong>
            </div>
            <div class="create-review-field">
              <span>Current Location</span>
              <strong>${escapeHtml(details.fromLocation)}</strong>
            </div>
            <div class="create-review-field">
              <span>New Location</span>
              <strong>${escapeHtml(details.toLocation)}</strong>
            </div>
            <div class="create-review-field">
              <span>Current Stock</span>
              <strong>${escapeHtml(String(Number(item.quantity ?? 0)))} ${escapeHtml(item.unit ?? "")}</strong>
            </div>
            <div class="create-review-field">
              <span>Remarks</span>
              <strong>${escapeHtml(details.remarks || "No remarks provided")}</strong>
            </div>
          </div>
        </section>
        <div class="confirm-dialog-actions">
          <button type="button" class="button-link" data-confirm-cancel>Review Again</button>
          <button type="button" class="button-primary" data-confirm-submit>Confirm Relocation</button>
        </div>
      </div>
    `;

    const close = (confirmed) => {
      document.removeEventListener("keydown", handleKeydown);
      modal.classList.remove("is-open");
      setTimeout(() => modal.remove(), 180);
      document.body.classList.remove("modal-open");
      resolve(confirmed);
    };

    document.body.append(modal);
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => modal.classList.add("is-open"));
    modal.querySelector("[data-confirm-submit]")?.focus();

    modal.querySelectorAll("[data-confirm-cancel]").forEach((element) => {
      element.addEventListener("click", () => close(false));
    });
    modal.querySelector("[data-confirm-submit]")?.addEventListener("click", () => close(true));

    function handleKeydown(event) {
      if (event.key === "Escape") {
        close(false);
      }
    }
    document.addEventListener("keydown", handleKeydown);
  });
}

function renderCorrectionPreviewItem({ label, beforeValue, afterValue, changed, meta = "" }) {
  return `
    <div class="correction-preview-item${changed ? " is-changed" : ""}">
      <div class="correction-preview-label">
        <span>${escapeHtml(label)}</span>
        ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
      </div>
      <div class="correction-preview-values">
        <div class="correction-preview-value">
          <span>Before</span>
          <strong>${escapeHtml(beforeValue || "-")}</strong>
        </div>
        <div class="correction-preview-arrow" aria-hidden="true">→</div>
        <div class="correction-preview-value correction-preview-after">
          <span>After</span>
          <strong>${escapeHtml(afterValue || "-")}</strong>
        </div>
      </div>
    </div>
  `;
}

function getCorrectableRecordKind(record) {
  return record?.type === "correction" ? record.rootSourceType : record?.type;
}

function getCorrectionPreviewItems(record, form) {
  const correctionKind = getCorrectableRecordKind(record);
  if (correctionKind === "create") {
    const labels = [
      ["brand", "Brand", "correctBrand-0"],
      ["model", "Category", "correctCategory-0"],
      ["name", "Description", "correctName-0"],
      ["sku", "Stock Code", "correctSku-0"],
      ["unit", "Unit", "correctUnit-0"],
      ["location", "Location", "correctLocation-0"]
    ];
    const item = record.itemRows[0] ?? {};
    return labels.map(([key, label, inputName]) => {
      const beforeValue = String(item[key] ?? "-");
      const afterValue = String(form.elements[inputName]?.value ?? "").trim().replace(/\s+/g, " ");
      return { label, beforeValue, afterValue: afterValue || "-", changed: beforeValue !== afterValue };
    });
  }

  const isStockIn = correctionKind === "stock-in";
  return record.itemRows.map((item, index) => {
    const beforeValue = isStockIn
      ? `${Number(item.quantity ?? 0)} ${item.stockType === "consignment" ? "Consignment" : "LC Stock"}`
      : `${Number(item.ownQuantity ?? 0)} LC / ${Number(item.consignmentQuantity ?? 0)} Consignment`;
    const afterValue = isStockIn
      ? `${Math.max(Number(form.elements[`correctQuantity-${index}`]?.value ?? 0), 0)} ${form.elements[`correctStockType-${index}`]?.value === "consignment" ? "Consignment" : "LC Stock"}`
      : `${Math.max(Number(form.elements[`correctOwn-${index}`]?.value ?? 0), 0)} LC / ${Math.max(Number(form.elements[`correctConsignment-${index}`]?.value ?? 0), 0)} Consignment`;
    return {
      label: item.name ?? item.sku ?? `Line ${index + 1}`,
      meta: item.sku ?? "",
      beforeValue,
      afterValue,
      changed: beforeValue !== afterValue
    };
  });
}

function buildCorrectionPreviewMarkup(record, form) {
  const previewItems = getCorrectionPreviewItems(record, form);
  const changedItems = previewItems.filter((item) => item.changed);
  const unchangedItems = previewItems.filter((item) => !item.changed);
  const visibleItems = changedItems.length ? changedItems : previewItems;
  return `
    <div class="correction-preview-summary">
      <strong>${changedItems.length}</strong>
      <span>changed ${getCorrectableRecordKind(record) === "create" ? "field" : "line"}${changedItems.length === 1 ? "" : "s"}</span>
    </div>
    <div class="correction-preview-list">
      ${visibleItems.map((item) => renderCorrectionPreviewItem(item)).join("")}
    </div>
    ${unchangedItems.length && changedItems.length ? `
      <details class="correction-preview-unchanged">
        <summary>Show ${unchangedItems.length} unchanged ${getCorrectableRecordKind(record) === "create" ? "field" : "line"}${unchangedItems.length === 1 ? "" : "s"}</summary>
        <div class="correction-preview-list">
          ${unchangedItems.map((item) => renderCorrectionPreviewItem(item)).join("")}
        </div>
      </details>
    ` : ""}
  `;
}

function showCorrectionConfirmationDialog(record, form) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "confirm-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "correction-confirm-title");
    const correctionKind = getCorrectableRecordKind(record);
    const isCreate = correctionKind === "create";
    const recordLabel = isCreate ? "stock creation" : correctionKind === "stock-in" ? "stock-in" : "stock-out";
    modal.innerHTML = `
      <div class="confirm-modal-backdrop" data-confirm-cancel></div>
      <div class="confirm-dialog create-stock-confirm-dialog">
        <div class="confirm-dialog-header">
          <div>
            <p class="eyebrow">Confirm Correction</p>
            <h3 id="correction-confirm-title">Save ${escapeHtml(recordLabel)} correction?</h3>
            <p class="section-copy">This will update ${isCreate ? "the master item information" : "inventory balances"} and create a permanent audit record.</p>
          </div>
        </div>
        <section class="create-review-card" aria-label="Correction summary">
          <div class="create-review-header">
            <div>
              <span class="create-review-kicker">Original record</span>
              <h4>${escapeHtml(record.title)}</h4>
            </div>
            <span class="create-review-location">${escapeHtml(record.itemRows.length)} line${record.itemRows.length === 1 ? "" : "s"}</span>
          </div>
          <div class="create-review-grid">
            <div class="create-review-field">
              <span>Recorded by</span>
              <strong>${escapeHtml(record.actor)}</strong>
            </div>
            <div class="create-review-field">
              <span>Correction type</span>
              <strong>${isCreate ? "Item information" : "Stock balance"}</strong>
            </div>
          </div>
          ${buildCorrectionPreviewMarkup(record, form)}
        </section>
        <div class="confirm-dialog-actions">
          <button type="button" class="button-link" data-confirm-cancel>Review Again</button>
          <button type="button" class="button-primary" data-confirm-submit>Confirm Correction</button>
        </div>
      </div>
    `;

    const close = (confirmed) => {
      document.removeEventListener("keydown", handleKeydown);
      modal.classList.remove("is-open");
      setTimeout(() => modal.remove(), 180);
      document.body.classList.remove("modal-open");
      resolve(confirmed);
    };

    document.body.append(modal);
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => modal.classList.add("is-open"));
    modal.querySelector("[data-confirm-submit]")?.focus();

    modal.querySelectorAll("[data-confirm-cancel]").forEach((element) => {
      element.addEventListener("click", () => close(false));
    });
    modal.querySelector("[data-confirm-submit]")?.addEventListener("click", () => close(true));

    function handleKeydown(event) {
      if (event.key === "Escape") {
        close(false);
      }
    }
    document.addEventListener("keydown", handleKeydown);
  });
}

function formatDateTime(value) {
  return new Date(value).toLocaleString();
}

function formatDateOnly(value) {
  return new Date(value).toLocaleDateString();
}

function renderActivityDateTime(value) {
  const date = new Date(value);
  return `
    <div class="activity-date-time">
      <strong>${escapeHtml(date.toLocaleDateString())}</strong>
      <span>${escapeHtml(date.toLocaleTimeString())}</span>
    </div>
  `;
}

function getActivityDetailMetricClass(label) {
  if (label === "Total Quantity Added") return "metric-card-total";
  if (label === "LC Stock Added") return "metric-card-lc";
  if (label === "Consignment Added") return "metric-card-consignment";
  if (label === "Original Record") return "activity-detail-origin-card";
  if (label === "Inventory Adjustment" || label === "Net Adjustment") return "activity-detail-adjustment-card";
  if (label === "Reason") return "activity-detail-reason-card";
  return "";
}

function renderActivityDetailMetricCard(row) {
  const className = ["metric-card", getActivityDetailMetricClass(row.label)].filter(Boolean).join(" ");
  if (row.label === "Original Record" && row.href) {
    return `
      <div class="${className}">
        <a class="activity-detail-record-link" href="${escapeHtml(row.href)}" title="Open original record ${escapeHtml(row.value)}">
          <strong>${escapeHtml(row.displayTitle ?? "Open original transaction")}</strong>
          ${row.displaySummary ? `<span class="activity-detail-record-summary">${escapeHtml(row.displaySummary)}</span>` : ""}
          ${row.displayMeta ? `<span class="activity-detail-record-meta">${escapeHtml(row.displayMeta)}</span>` : ""}
        </a>
        <span>${escapeHtml(row.label)}</span>
      </div>
    `;
  }
  if (row.label === "Reason") {
    return `
      <div class="${className}">
        <p class="activity-detail-reason-text">${escapeHtml(row.value)}</p>
        <span>${escapeHtml(row.label)}</span>
      </div>
    `;
  }
  const valueMarkup = row.href
    ? `<a class="activity-detail-record-link" href="${escapeHtml(row.href)}">${escapeHtml(row.value)}</a>`
    : `<strong>${escapeHtml(row.value)}</strong>`;
  return `
    <div class="${className}">
      ${valueMarkup}
      <span>${escapeHtml(row.label)}</span>
    </div>
  `;
}

function getActivityDetailSectionCopy(record) {
  if (record.type === "create") {
    return {
      eyebrow: "Master Item",
      title: "Item information",
      copy: "Review the master item fields captured when this stock record was created."
    };
  }
  if (record.type === "correction" && getCorrectableRecordKind(record) === "create") {
    return {
      eyebrow: "Information Changes",
      title: "Corrected item fields",
      copy: "Review the item information before and after this stock creation correction."
    };
  }
  if (record.type === "stock-in") {
    return {
      eyebrow: "Stock-In Lines",
      title: "Received stock lines",
      copy: "Review the item-level quantities and receiving categories for this stock-in record."
    };
  }
  if (record.type === "stock-out") {
    return {
      eyebrow: "Stock-Out Lines",
      title: "Issued stock lines",
      copy: "Review the item-level quantities issued and reference details for this stock-out record."
    };
  }
  if (record.type === "relocate") {
    return {
      eyebrow: "Relocation Line",
      title: "Moved stock location",
      copy: "Review the item and storage location change captured for this warehouse movement."
    };
  }
  return {
    eyebrow: "Correction Lines",
    title: "Corrected stock movement",
    copy: "Review the item-level stock balance adjustment and corrected LC or consignment quantity for this transaction."
  };
}

function renderCreateCorrectionChanges(item) {
  const labels = {
    brand: "Brand",
    model: "Category",
    name: "Description",
    sku: "Stock Code",
    unit: "Unit",
    location: "Location"
  };
  const changedFields = item.changedFields?.length ? item.changedFields : Object.keys(labels);
  return changedFields.map((field) => `
    <tr>
      <td>${escapeHtml(labels[field] ?? field)}</td>
      <td>${escapeHtml(item.previousValues?.[field] ?? "-")}</td>
      <td><strong>${escapeHtml(item.correctedValues?.[field] ?? item[field] ?? "-")}</strong></td>
    </tr>
  `).join("");
}

function formatMovementRecordQuantity(quantity, sourceKind) {
  const movementQuantity = Number(quantity ?? 0);
  if (!movementQuantity) return "0";
  const signedQuantity = sourceKind === "stock-out" ? -Math.abs(movementQuantity) : Math.abs(movementQuantity);
  return `${signedQuantity > 0 ? "+" : ""}${signedQuantity}`;
}

function formatSignedQuantity(quantity) {
  const signedQuantity = Number(quantity ?? 0);
  return `${signedQuantity > 0 ? "+" : ""}${signedQuantity}`;
}

function formatAdjustmentBreakdownSummary(rows) {
  const ownDelta = (rows ?? []).reduce((sum, row) => sum + Number(row.ownDelta ?? 0), 0);
  const consignmentDelta = (rows ?? []).reduce((sum, row) => sum + Number(row.consignmentDelta ?? 0), 0);
  const totalDelta = ownDelta + consignmentDelta;
  const parts = [];
  if (ownDelta) parts.push(`LC Stock ${formatSignedQuantity(ownDelta)}`);
  if (consignmentDelta) parts.push(`Consignment ${formatSignedQuantity(consignmentDelta)}`);
  if (!parts.length) parts.push(formatSignedQuantity(totalDelta));
  return parts.join(" | ");
}

function renderMovementChangeValue(item, prefix, sourceKind, visibleSources) {
  const rows = [
    visibleSources.includes("own")
      ? `<span><strong>LC Stock</strong> ${escapeHtml(formatMovementRecordQuantity(item[`${prefix}OwnMovementQuantity`], sourceKind))}</span>`
      : "",
    visibleSources.includes("consignment")
      ? `<span><strong>Consignment</strong> ${escapeHtml(formatMovementRecordQuantity(item[`${prefix}ConsignmentMovementQuantity`], sourceKind))}</span>`
      : ""
  ].filter(Boolean).join("");

  return `<div class="activity-detail-movement-compact">${rows || `<span>${escapeHtml(formatMovementRecordQuantity(0, sourceKind))}</span>`}</div>`;
}

function renderCorrectionAdjustmentValue(ownQuantity, consignmentQuantity, showOwnMovementColumn, showConsignmentMovementColumn) {
  const rows = [
    showOwnMovementColumn
      ? `<div><strong>LC Stock</strong> ${renderActivityDetailQuantityValue(ownQuantity, "correction")}</div>`
      : "",
    showConsignmentMovementColumn
      ? `<div><strong>Consignment</strong> ${renderActivityDetailQuantityValue(consignmentQuantity, "correction")}</div>`
      : ""
  ].filter(Boolean).join("");

  return `<div class="activity-detail-adjustment-compact">${rows}</div>`;
}

function renderMovementCorrectionTable(record, movementSourceKind, showOwnMovementColumn, showConsignmentMovementColumn) {
  return `
    <table class="activity-detail-correction-table">
      <thead>
        <tr>
          <th>Brand</th>
          <th>Category</th>
          <th>Description</th>
          <th>Stock Code</th>
          <th>Adjustment</th>
          <th>Previously Recorded</th>
          <th>Corrected Record</th>
          <th>Unit</th>
          <th>Location</th>
        </tr>
      </thead>
      <tbody>
        ${record.itemRows.map((item) => {
          const ownDisplayQuantity = item.ownDelta ?? item.ownQuantity ?? 0;
          const consignmentDisplayQuantity = item.consignmentDelta ?? item.consignmentQuantity ?? 0;
          const visibleBreakdownSources = [
            Number(item.previousOwnMovementQuantity ?? 0) || Number(item.correctedOwnMovementQuantity ?? 0) ? "own" : "",
            Number(item.previousConsignmentMovementQuantity ?? 0) || Number(item.correctedConsignmentMovementQuantity ?? 0) ? "consignment" : ""
          ].filter(Boolean);

          return `
            <tr>
              <td>${escapeHtml(item.brand)}</td>
              <td>${escapeHtml(item.model)}</td>
              <td><strong class="activity-detail-description-compact">${escapeHtml(item.name)}</strong></td>
              <td>${escapeHtml(item.sku)}</td>
              <td>${renderCorrectionAdjustmentValue(ownDisplayQuantity, consignmentDisplayQuantity, showOwnMovementColumn, showConsignmentMovementColumn)}</td>
              <td>${renderMovementChangeValue(item, "previous", movementSourceKind, visibleBreakdownSources)}</td>
              <td>${renderMovementChangeValue(item, "corrected", movementSourceKind, visibleBreakdownSources)}</td>
              <td>${escapeHtml(item.unit)}</td>
              <td>${escapeHtml(item.location)}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderActivityDetailItemsSection(record) {
  const sectionCopy = getActivityDetailSectionCopy(record);
  if (record.type === "relocate") {
    return `
      <section class="panel activity-detail-items">
        <div class="panel-header panel-header-tight">
          <div>
            <p class="eyebrow">${escapeHtml(sectionCopy.eyebrow)}</p>
            <h3>${escapeHtml(sectionCopy.title)}</h3>
            <p class="section-copy">${escapeHtml(sectionCopy.copy)}</p>
          </div>
        </div>
        <table class="activity-detail-master-table">
          <thead>
            <tr>
              <th>Brand</th>
              <th>Category</th>
              <th>Description</th>
              <th>Stock Code</th>
              <th>Current Stock</th>
              <th>Unit</th>
              <th>From Location</th>
              <th>To Location</th>
            </tr>
          </thead>
          <tbody>
            ${record.itemRows.map((item) => `
              <tr>
                <td>${escapeHtml(item.brand)}</td>
                <td>${escapeHtml(item.model)}</td>
                <td><strong>${escapeHtml(item.name)}</strong></td>
                <td>${escapeHtml(item.sku)}</td>
                <td>${escapeHtml(String(item.quantity ?? 0))}</td>
                <td>${escapeHtml(item.unit)}</td>
                <td>${escapeHtml(item.fromLocation)}</td>
                <td>${escapeHtml(item.toLocation)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
    `;
  }
  const isCreateRecord = record.type === "create";
  const isCreateCorrection = record.type === "correction" && getCorrectableRecordKind(record) === "create";
  const isMovementCorrection = record.type === "correction" && !isCreateCorrection;
  const movementSourceKind = isMovementCorrection ? getCorrectableRecordKind(record) : record.type;
  const hasOwnMovement = !isCreateRecord && !isCreateCorrection
    ? record.itemRows.some((item) => Number(isMovementCorrection ? item.ownDelta ?? item.ownQuantity ?? 0 : item.ownQuantity ?? 0) !== 0)
    : true;
  const hasConsignmentMovement = !isCreateRecord && !isCreateCorrection
    ? record.itemRows.some((item) => Number(isMovementCorrection ? item.consignmentDelta ?? item.consignmentQuantity ?? 0 : item.consignmentQuantity ?? 0) !== 0)
    : true;
  const showOwnMovementColumn = hasOwnMovement || !hasConsignmentMovement;
  const showConsignmentMovementColumn = hasConsignmentMovement;
  const tableMarkup = isCreateCorrection
    ? `
      <table class="activity-detail-change-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Previous Value</th>
            <th>Corrected Value</th>
          </tr>
        </thead>
        <tbody>
          ${record.itemRows.map((item) => renderCreateCorrectionChanges(item)).join("")}
        </tbody>
      </table>
    `
    : isCreateRecord
      ? `
        <table class="activity-detail-master-table">
          <thead>
            <tr>
              <th>Brand</th>
              <th>Category</th>
              <th>Description</th>
              <th>Stock Code</th>
              <th>Unit</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            ${record.itemRows.map((item) => `
              <tr>
                <td>${escapeHtml(item.brand)}</td>
                <td>${escapeHtml(item.model)}</td>
                <td><strong>${escapeHtml(item.name)}</strong></td>
                <td>${escapeHtml(item.sku)}</td>
                <td>${escapeHtml(item.unit)}</td>
                <td>${escapeHtml(item.location)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `
      : isMovementCorrection
        ? renderMovementCorrectionTable(record, movementSourceKind, showOwnMovementColumn, showConsignmentMovementColumn)
        : `
        <table${isMovementCorrection ? ' class="activity-detail-movement-correction-table"' : ""}>
          <thead>
            <tr>
              <th>Brand</th>
              <th>Category</th>
              <th>Description</th>
              <th>Stock Code</th>
              ${showOwnMovementColumn ? `<th>${isMovementCorrection ? "LC Adjustment" : "LC Stock"}</th>` : ""}
              ${showConsignmentMovementColumn ? `<th>${isMovementCorrection ? "Consignment Adjustment" : "Consignment"}</th>` : ""}
              <th>Unit</th>
              <th>Location</th>
              ${record.type === "stock-out" ? "<th>Balance After</th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${record.itemRows.map((item) => {
              const ownDisplayQuantity = item.ownQuantity ?? 0;
              const consignmentDisplayQuantity = item.consignmentQuantity ?? 0;
              return `
                <tr>
                  <td>${escapeHtml(item.brand)}</td>
                  <td>${escapeHtml(item.model)}</td>
                  <td><strong>${escapeHtml(item.name)}</strong></td>
                  <td>${escapeHtml(item.sku)}</td>
                  ${showOwnMovementColumn ? `<td class="activity-detail-quantity-cell">${renderActivityDetailQuantityValue(ownDisplayQuantity, record.type)}</td>` : ""}
                  ${showConsignmentMovementColumn ? `<td class="activity-detail-quantity-cell">${renderActivityDetailQuantityValue(consignmentDisplayQuantity, record.type)}${record.type !== "stock-out" && item.consignmentToRestock ? `<br><span class="muted">${escapeHtml(String(item.consignmentToRestock))} to restock</span>` : ""}</td>` : ""}
                  <td>${escapeHtml(item.unit)}</td>
                  <td>${escapeHtml(item.location)}</td>
                  ${record.type === "stock-out" ? `<td class="activity-detail-balance-after">${escapeHtml(String(item.balanceAfter ?? 0))}</td>` : ""}
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;

  return `
    <section class="panel activity-detail-items">
      <div class="panel-header panel-header-tight">
        <div>
          <p class="eyebrow">${sectionCopy.eyebrow}</p>
          <h3>${sectionCopy.title}</h3>
          <p class="section-copy">${sectionCopy.copy}</p>
        </div>
      </div>
      <div class="table-wrap elevated-table">
        ${tableMarkup}
      </div>
    </section>
  `;
}

function renderActivityAuditTrailSection(record, data, activeType, activeId) {
  const rootType = record.type === "correction" ? record.rootSourceType : record.type;
  const rootId = record.type === "correction" ? record.rootSourceId : activeId;
  if (!["create", "stock-in", "stock-out"].includes(rootType) || !rootId) return "";

  const originalRecord = getOriginalAuditRecord(data, rootType, rootId);
  if (!originalRecord) return "";

  const correctionChain = getCorrectionAuditChain(data, rootType, rootId);
  if (!correctionChain.length && record.type !== "correction") return "";
  const nodes = [
    {
      type: rootType,
      id: rootId,
      title: originalRecord.title,
      actor: originalRecord.actor,
      createdAt: originalRecord.createdAt,
      summary: originalRecord.summary,
      meta: "Original record"
    },
    ...correctionChain.map((correction, index) => ({
      type: "correction",
      id: correction.id,
      title: getCorrectionSourceKind(correction) === "create"
        ? "Stock Creation Correction"
        : getCorrectionSourceKind(correction) === "stock-out"
          ? "Stock-Out Correction"
          : "Stock-In Correction",
      actor: correction.actorName ?? "Unknown User",
      createdAt: correction.createdAt,
      summary: getCorrectionChangeSummary(correction),
      reason: correction.reason ?? "No reason provided",
      meta: `Correction ${index + 1}`
    }))
  ];

  return `
    <section class="panel project-card activity-audit-trail">
      <div class="panel-header panel-header-tight">
        <div>
          <p class="eyebrow">Audit Trail</p>
          <h3>Correction history</h3>
          <p class="section-copy">Trace the original record and every correction applied to it. This record has ${correctionChain.length} correction${correctionChain.length === 1 ? "" : "s"}.</p>
        </div>
      </div>
      <div class="activity-audit-list">
        ${nodes.map((node) => {
          const isActive = node.type === activeType && node.id === activeId;
          return `
            <article class="activity-audit-node activity-audit-node-${node.type === rootType ? "original" : "correction"}${isActive ? " is-active" : ""}">
              <div class="activity-audit-marker" aria-hidden="true"></div>
              <div class="activity-audit-card">
                <div class="activity-audit-card-header">
                  <div>
                    <span>${escapeHtml(node.meta)}</span>
                    <h4>${escapeHtml(node.title)}</h4>
                  </div>
                  ${isActive ? `<strong class="activity-audit-current">Current view</strong>` : `<a class="button-link" href="activity-detail.html?type=${encodeURIComponent(node.type)}&id=${encodeURIComponent(node.id)}">Open Record</a>`}
                </div>
                <div class="activity-audit-meta">
                  <span>${escapeHtml(formatDateTime(node.createdAt))}</span>
                  <span>${escapeHtml(node.actor)}</span>
                </div>
                <p>${escapeHtml(node.summary ?? "-")}</p>
                ${node.reason ? `<p class="activity-audit-reason"><strong>Reason:</strong> ${escapeHtml(node.reason)}</p>` : ""}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function formatActivityDetailQuantity(value, type) {
  const quantity = Number(value ?? 0);
  if (type === "stock-in") return `+${quantity}`;
  if (type === "stock-out") return `-${quantity}`;
  if (type === "correction") return `${quantity > 0 ? "+" : ""}${quantity}`;
  return String(quantity);
}

function renderActivityDetailQuantityValue(value, type) {
  const quantity = Number(value ?? 0);
  if (!quantity) return `<span class="muted">-</span>`;
  return `<span class="${getActivityQuantityClass(type, quantity)}">${escapeHtml(formatActivityDetailQuantity(quantity, type))}</span>`;
}

function getActivityQuantityClass(type, quantity = 0) {
  if (type === "stock-in") return "activity-quantity-positive";
  if (type === "stock-out") return "activity-quantity-negative";
  if (type === "correction") {
    if (Number(quantity) > 0) return "activity-quantity-positive";
    if (Number(quantity) < 0) return "activity-quantity-negative";
    return "activity-quantity-correction";
  }
  return "";
}

function renderCorrectionSection(record) {
  const correctionKind = record.type === "correction" ? record.rootSourceType : record.type;
  if (!["create", "stock-in", "stock-out"].includes(correctionKind)) return "";
  const currentUser = getCurrentUser();
  const canCorrect = canCorrectActivityRecord(record, currentUser);
  if (record.hasCorrection) {
    return `
      <section class="panel project-card correction-panel">
        <div class="panel-header panel-header-tight">
          <div>
            <p class="eyebrow">Correction</p>
            <h3>This record has correction history</h3>
            <p class="section-copy">Open the latest correction record before applying another adjustment. The original and older correction records remain read-only for audit traceability.</p>
          </div>
          ${record.latestCorrectionId ? `<a class="button-link" href="activity-detail.html?type=correction&id=${encodeURIComponent(record.latestCorrectionId)}">View Latest Correction</a>` : ""}
        </div>
      </section>
    `;
  }
  const isStockIn = correctionKind === "stock-in";
  const isCreate = correctionKind === "create";
  const recordLabel = isCreate ? "stock creation" : isStockIn ? "stock-in" : "stock-out";
  if (!canCorrect) {
    return `
      <section class="panel project-card correction-panel">
        <div class="panel-header panel-header-tight">
          <div>
            <p class="eyebrow">Correction</p>
            <h3>Correction access restricted</h3>
            <p class="section-copy">This ${escapeHtml(recordLabel)} record can only be corrected by ${escapeHtml(getCorrectionPermissionLabel(correctionKind))} users. You are signed in as ${escapeHtml(getUserRole(currentUser))}.</p>
          </div>
        </div>
      </section>
    `;
  }
  return `
    <section class="panel project-card correction-panel">
      <div class="panel-header panel-header-tight correction-gate">
        <div>
          <p class="eyebrow">Correction</p>
          <h3>Correction required?</h3>
          <p class="section-copy">Use this only to fix ${recordLabel} information that was keyed wrongly. A correction creates an audit record and cannot be casually undone.</p>
        </div>
        <button type="button" class="button-secondary" data-start-correction>Start Correction</button>
      </div>
      <form id="correction-form" class="stack-form correction-form" hidden>
        <div class="correction-form-header">
          <div>
            <p class="eyebrow">Active Correction</p>
            <h3>Correct this ${recordLabel} record</h3>
            <p class="section-copy">${isCreate ? "Create an audit-safe correction for item information keyed wrongly during creation." : "Create an audit-safe correction. The original record remains unchanged and the inventory balance is adjusted by the correction."}</p>
          </div>
          <button type="button" class="button-link" data-cancel-correction>Cancel Correction</button>
        </div>
        ${isCreate ? `
          <div class="field-grid">
            ${record.itemRows.map((item, index) => `
              <label>
                Brand
                <input name="correctBrand-${index}" type="text" value="${escapeHtml(item.brand ?? "")}" placeholder="CommScope" required>
              </label>
              <label>
                Category
                <input name="correctCategory-${index}" type="text" value="${escapeHtml(item.model ?? "")}" placeholder="Cable / Patch Cord" required>
              </label>
              <label>
                Description
                <input name="correctName-${index}" type="text" value="${escapeHtml(item.name ?? "")}" placeholder="Cat6 UTP Cable Box 305m" required>
              </label>
              <label>
                Stock code
                <input name="correctSku-${index}" type="text" value="${escapeHtml(item.sku ?? "")}" placeholder="SC-001" required>
              </label>
              <label>
                Unit
                <input name="correctUnit-${index}" type="text" value="${escapeHtml(item.unit ?? "")}" placeholder="pcs / rolls / m" required>
              </label>
              <label>
                Location
                <input name="correctLocation-${index}" type="text" value="${escapeHtml(item.location ?? "")}" placeholder="Main Store A-01" required>
              </label>
            `).join("")}
          </div>
        ` : `
          <div class="table-wrap elevated-table">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Stock Code</th>
                ${isStockIn ? "<th>Correct Qty</th><th>Correct Category</th>" : "<th>Correct LC Issued</th><th>Correct Consignment Issued</th>"}
              </tr>
            </thead>
            <tbody>
              ${record.itemRows.map((item, index) => `
                <tr data-correction-row data-item-id="${escapeHtml(item.itemId ?? "")}">
                  <td>
                    <strong>${escapeHtml(item.name)}</strong>
                    <br><span class="muted">${escapeHtml(item.brand ?? "-")} / ${escapeHtml(item.model ?? "-")}</span>
                  </td>
                  <td>${escapeHtml(item.sku ?? "-")}</td>
                  ${isStockIn ? `
                    <td><input class="stock-out-qty-input" name="correctQuantity-${index}" type="number" min="0" step="1" value="${escapeHtml(String(item.quantity ?? 0))}"></td>
                    <td>
                      <select name="correctStockType-${index}">
                        <option value="own" ${(item.stockType ?? "own") !== "consignment" ? "selected" : ""}>LC Stock</option>
                        <option value="consignment" ${(item.stockType ?? "own") === "consignment" ? "selected" : ""}>Consignment</option>
                      </select>
                    </td>
                  ` : `
                    <td><input class="stock-out-qty-input" name="correctOwn-${index}" type="number" min="0" step="1" value="${escapeHtml(String(item.ownQuantity ?? 0))}"></td>
                    <td><input class="stock-out-qty-input" name="correctConsignment-${index}" type="number" min="0" step="1" value="${escapeHtml(String(item.consignmentQuantity ?? 0))}"></td>
                  `}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        `}
        <label>
          Correction reason
          <textarea id="correction-reason" rows="3" required placeholder="${isCreate ? "Example: stock code keyed wrongly, wrong brand selected, typo in description" : "Example: quantity keyed wrongly, wrong category selected, duplicate entry"}"></textarea>
        </label>
        <div class="form-actions">
          <button type="submit" class="button-secondary">Save Correction</button>
          <span class="form-hint">Corrections create a new audit record and update ${isCreate ? "the master item information" : "inventory balances"}.</span>
        </div>
      </form>
    </section>
  `;
}

function formatUserSummary(user) {
  return `${escapeHtml(getUserDisplayName(user))} | ${escapeHtml(getUserRole(user))}`;
}

async function handleSignOut() {
  try {
    await fetchWithTimeout(API_LOGOUT_ENDPOINT, { method: "POST" });
  } catch (error) {
    console.warn("Could not clear backend session:", error);
  } finally {
    clearCurrentUser();
    redirectToLogin();
  }
}

function attachSignOutHandler(button) {
  if (!button || button.dataset.bound) return;
  button.addEventListener("click", handleSignOut);
  button.dataset.bound = "true";
}

function initAuthChrome(currentUser) {
  if (!currentUser) return;

  const topbarActions = document.querySelector(".topbar-actions");
  if (topbarActions && !topbarActions.querySelector("[data-session-chip]")) {
    const existingActions = Array.from(topbarActions.children);
    const sessionSlot = document.createElement("div");
    sessionSlot.className = "topbar-session-slot";
    sessionSlot.innerHTML = `
      <div class="session-chip" data-session-chip>
        <span class="session-chip-label">Signed in</span>
        <strong>${formatUserSummary(currentUser)}</strong>
      </div>
    `;

    const navGroup = document.createElement("div");
    navGroup.className = "topbar-nav-group";
    existingActions.forEach((action) => navGroup.append(action));

    topbarActions.replaceChildren(sessionSlot, navGroup);
    const signOutButton = document.createElement("button");
    signOutButton.type = "button";
    signOutButton.className = "button-link button-link-ghost button-link-signout";
    signOutButton.textContent = "Sign Out";
    navGroup.append(signOutButton);
    attachSignOutHandler(signOutButton);
  }

  const sidebar = document.querySelector(".sidebar");
  if (sidebar && !sidebar.querySelector("[data-session-panel]")) {
    const sessionPanel = document.createElement("section");
    sessionPanel.className = "sidebar-panel session-panel";
    sessionPanel.dataset.sessionPanel = "true";
    sessionPanel.innerHTML = `
      <p class="eyebrow">Current User</p>
      <strong>${escapeHtml(getUserDisplayName(currentUser))}</strong>
      <span>${escapeHtml(getUserRole(currentUser))}</span>
      <button type="button" class="button-link button-link-ghost">Sign Out</button>
    `;
    sidebar.append(sessionPanel);
    attachSignOutHandler(sessionPanel.querySelector("button"));
  }
}

function applyRoleNavigation(currentUser) {
  if (!currentUser) return;

  document.querySelectorAll("a[href]").forEach((link) => {
    if (!canAccessHref(link.getAttribute("href"), currentUser)) {
      link.remove();
    }
  });

  document.querySelectorAll("#home-action-grid .primary-action-card").forEach((card, index) => {
    const icon = card.querySelector(".primary-action-icon");
    if (icon) icon.textContent = String(index + 1).padStart(2, "0");
  });
}

function initHomePage(currentUser) {
  const actionGrid = document.querySelector("#home-action-grid");
  const homeTitle = document.querySelector("#home-title");
  const homeCopy = document.querySelector("#home-copy");
  const homeSessionPanel = document.querySelector("#home-session-panel");
  if (!actionGrid || !homeTitle || !homeCopy || !homeSessionPanel || !currentUser) return;

  actionGrid.hidden = false;
  homeTitle.textContent = "Choose an action";
  homeCopy.textContent = `Signed in as ${getUserDisplayName(currentUser)}. Continue with the inventory task you need.`;
  homeSessionPanel.innerHTML = `
    <section class="auth-panel auth-panel-session">
      <div>
        <p class="eyebrow">Session Active</p>
        <h2>${escapeHtml(getUserDisplayName(currentUser))}</h2>
        <p class="auth-copy">${escapeHtml(getUserRole(currentUser))} account is active on this browser.</p>
      </div>
      <div class="auth-actions">
        <button type="button" class="button-link button-link-ghost" id="home-sign-out">Sign Out</button>
      </div>
    </section>
  `;
  attachSignOutHandler(document.querySelector("#home-sign-out"));
}

function initLoginPage(currentUser) {
  const authPanel = document.querySelector("#login-auth-panel");
  const loginTitle = document.querySelector("#login-title");
  const loginCopy = document.querySelector("#login-copy");
  if (!authPanel || !loginTitle || !loginCopy) return;

  if (currentUser) {
    loginTitle.textContent = "Session already active";
    loginCopy.textContent = `You are already signed in as ${getUserDisplayName(currentUser)}.`;
    authPanel.innerHTML = `
      <section class="auth-panel auth-panel-session">
        <div>
          <p class="eyebrow">Signed In</p>
          <h2>${escapeHtml(getUserDisplayName(currentUser))}</h2>
          <p class="auth-copy">${escapeHtml(getUserRole(currentUser))} account is active on this browser.</p>
        </div>
        <div class="auth-actions">
          <a class="button-link" href="index.html">Continue to Home</a>
          <button type="button" class="button-link button-link-ghost" id="login-sign-out">Sign Out</button>
        </div>
      </section>
    `;
    attachSignOutHandler(document.querySelector("#login-sign-out"));
    return;
  }

  loginTitle.textContent = "Sign in to continue";
  loginCopy.textContent = "Sign in so the server can record who creates, adds, relocates, and draws stock.";
  authPanel.innerHTML = `
    <section class="auth-panel">
      <div>
        <p class="eyebrow">User Login</p>
        <h2>Inventory access</h2>
        <p class="auth-copy">Access is verified by the backend before stock data can be opened or changed.</p>
      </div>
      <form id="login-form" class="stack-form auth-form">
        <div class="field-grid auth-grid">
          <label>
            Username
            <input name="username" type="text" autocomplete="username" placeholder="admin" required>
          </label>
          <label>
            Password
            <input name="password" type="password" autocomplete="current-password" placeholder="Admin123!" required>
          </label>
        </div>
        <div class="form-actions auth-actions">
          <button type="submit" class="button-primary">Sign In</button>
          <span class="form-hint">Your session is managed by the backend.</span>
        </div>
      </form>
    </section>
  `;

  const loginForm = document.querySelector("#login-form");
  if (!loginForm) return;

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(loginForm);
    const username = String(form.get("username") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const submitButton = loginForm.querySelector("button[type='submit']");
    if (submitButton) submitButton.disabled = true;

    try {
      const response = await fetchWithTimeout(API_LOGIN_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        showNotice(authPanel, "Invalid username or password.");
        return;
      }

      const payload = await response.json();
      setCurrentUser(payload.user);
      sessionLoadPromise = Promise.resolve(currentUserCache);
      redirectAfterLogin();
    } catch (error) {
      showNotice(authPanel, "Could not reach the backend login service. Please try again.");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

function initSidebar() {
  const body = document.body;
  const sidebar = document.querySelector(".sidebar");
  const toggleButtons = document.querySelectorAll("[data-sidebar-toggle]");
  const closeButtons = document.querySelectorAll("[data-sidebar-close]");
  const key = "ims-sidebar-open";
  const desktopBreakpoint = 1120;
  let closeTimer;

  if (!sidebar) return;

  body.classList.add("has-edge-sidebar");

  const setOpen = (open) => {
    if (window.innerWidth > desktopBreakpoint) {
      body.classList.remove("sidebar-open");
      localStorage.setItem(key, "0");
      return;
    }
    body.classList.toggle("sidebar-open", open);
    localStorage.setItem(key, open ? "1" : "0");
  };

  const setPeek = (open) => {
    if (window.innerWidth <= desktopBreakpoint || body.classList.contains("sidebar-open")) return;
    body.classList.toggle("sidebar-peek", open);
  };

  const clearPeekTimer = () => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = undefined;
    }
  };

  const schedulePeekClose = () => {
    clearPeekTimer();
    closeTimer = setTimeout(() => setPeek(false), 120);
  };

  if (window.innerWidth <= desktopBreakpoint) {
    setOpen(localStorage.getItem(key) === "1");
  } else {
    localStorage.setItem(key, "0");
  }

  toggleButtons.forEach((button) => {
    if (button.dataset.bound) return;
    button.addEventListener("click", () => {
      setOpen(!body.classList.contains("sidebar-open"));
    });
    button.dataset.bound = "true";
  });

  closeButtons.forEach((button) => {
    if (button.dataset.bound) return;
    button.addEventListener("click", () => setOpen(false));
    button.dataset.bound = "true";
  });

  if (!body.dataset.sidebarEscBound) {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        setPeek(false);
      }
    });
    body.dataset.sidebarEscBound = "true";
  }

  if (!body.dataset.sidebarEdgeBound) {
    document.addEventListener("pointermove", (event) => {
      if (window.innerWidth <= desktopBreakpoint) return;
      if (event.clientX <= 18) {
        clearPeekTimer();
        setPeek(true);
      } else if (!sidebar.matches(":hover")) {
        schedulePeekClose();
      }
    });

    sidebar.addEventListener("pointerenter", () => {
      if (window.innerWidth <= desktopBreakpoint) return;
      clearPeekTimer();
      setPeek(true);
    });

    sidebar.addEventListener("pointerleave", () => {
      if (window.innerWidth <= desktopBreakpoint) return;
      schedulePeekClose();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth <= desktopBreakpoint) {
        body.classList.remove("sidebar-peek");
      } else {
        body.classList.remove("sidebar-open");
        body.classList.remove("sidebar-peek");
        localStorage.setItem(key, "0");
      }
    });

    body.dataset.sidebarEdgeBound = "true";
  }
}

function initSectionNavigation() {
  const sectionLinks = Array.from(document.querySelectorAll('.nav-link-secondary[href^="#"], .command-link[href^="#"]'));
  if (!sectionLinks.length) return;

  const navLinks = Array.from(document.querySelectorAll('.nav-link-secondary[href^="#"]'));
  const sections = navLinks
    .map((link) => {
      const target = document.querySelector(link.getAttribute("href"));
      return target ? { link, target } : null;
    })
    .filter(Boolean);

  const setActive = (id) => {
    navLinks.forEach((link) => {
      const isActive = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("is-current", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  sectionLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const href = link.getAttribute("href");
      if (href?.startsWith("#")) {
        const id = href.slice(1);
        if (id) setActive(id);
      }

      if (window.innerWidth <= 1120) {
        document.body.classList.remove("sidebar-open");
        localStorage.setItem("ims-sidebar-open", "0");
      }
    });
  });

  if (!sections.length) return;

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (visible?.target?.id) {
      setActive(visible.target.id);
    }
  }, {
    rootMargin: "-20% 0px -55% 0px",
    threshold: [0.2, 0.35, 0.6]
  });

  sections.forEach(({ target }) => observer.observe(target));

  const initialHash = window.location.hash.replace(/^#/, "");
  setActive(initialHash || sections[0].target.id);
}

function initModals() {
  const body = document.body;
  const openButtons = document.querySelectorAll("[data-modal-open]");
  const closeButtons = document.querySelectorAll("[data-modal-close]");
  const modals = document.querySelectorAll(".modal");

  const closeModal = () => {
    body.classList.remove("modal-open");
    modals.forEach((modal) => {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
    });
  };

  openButtons.forEach((button) => {
    if (button.dataset.bound) return;
    button.addEventListener("click", () => {
      const modal = document.getElementById(button.dataset.modalOpen);
      if (!modal) return;
      closeModal();
      body.classList.add("modal-open");
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
    });
    button.dataset.bound = "true";
  });

  closeButtons.forEach((button) => {
    if (button.dataset.bound) return;
    button.addEventListener("click", closeModal);
    button.dataset.bound = "true";
  });

  modals.forEach((modal) => {
    if (modal.dataset.bound) return;
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });
    modal.dataset.bound = "true";
  });

  if (!body.dataset.modalEscBound) {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });
    body.dataset.modalEscBound = "true";
  }

  return { closeModal };
}

function openModalFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const modalId = params.get("openModal");
  if (!modalId) return;

  const modal = document.getElementById(modalId);
  if (!modal) return;

  document.body.classList.add("modal-open");
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function initCollapsibles() {
  const buttons = document.querySelectorAll("[data-collapse-toggle]");
  buttons.forEach((button) => {
    if (button.dataset.bound) return;

    const targetId = button.dataset.collapseToggle;
    const content = document.getElementById(targetId);
    const panel = button.closest(".collapsible-panel");
    const storageKey = `ims-collapse-${targetId}`;

    const setExpanded = (expanded) => {
      button.setAttribute("aria-expanded", expanded ? "true" : "false");
      if (content) content.hidden = !expanded;
      if (panel) panel.classList.toggle("is-collapsed", !expanded);
      const indicator = button.querySelector(".collapse-indicator");
      if (indicator) indicator.textContent = expanded ? "Collapse" : "Expand";
      localStorage.setItem(storageKey, expanded ? "1" : "0");
    };

    setExpanded(localStorage.getItem(storageKey) === "1");

    button.addEventListener("click", () => {
      setExpanded(button.getAttribute("aria-expanded") !== "true");
    });

    button.dataset.bound = "true";
  });
}

function buildAdjustmentOptions(inventory) {
  const groupedInventory = inventory.reduce((groups, item) => {
    const groupLabel = String(item.model ?? "Other").trim() || "Other";
    if (!groups.has(groupLabel)) groups.set(groupLabel, []);
    groups.get(groupLabel).push(item);
    return groups;
  }, new Map());

  return Array.from(groupedInventory.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([groupLabel, items]) => {
      const options = items
        .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")))
        .map((item) => `<option value="${item.id}">${escapeHtml(item.name)} | ${escapeHtml(item.brand ?? "Generic")} (${escapeHtml(item.sku)})</option>`)
        .join("");
      return `<optgroup label="${escapeHtml(groupLabel)}">${options}</optgroup>`;
    })
    .join("");
}

function buildStockOutOptions(inventory) {
  return buildAdjustmentOptions(
    inventory
      .filter((item) => item.quantity > 0)
      .map((item) => ({
        ...item,
        name: `${item.name} (${item.sku}) - ${item.quantity} ${item.unit ?? ""} available`.trim()
      }))
  );
}

function getStockPickerSearchText(item) {
  return [
    item.name,
    item.sku,
    item.brand,
    item.model,
    item.location
  ].map((value) => String(value ?? "").toLowerCase()).join(" ");
}

function renderStockPickerList(container, inventory, selectedId, searchTerm = "", options = {}) {
  if (!container) return;
  const onlyInStock = options.onlyInStock !== false;
  const emptyMessage = options.emptyMessage ?? "No available stock matches your search.";
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const availableItems = inventory
    .filter((item) => !onlyInStock || item.quantity > 0)
    .filter((item) => !normalizedSearch || getStockPickerSearchText(item).includes(normalizedSearch))
    .sort((a, b) => String(a.model ?? "").localeCompare(String(b.model ?? "")) || String(a.name ?? "").localeCompare(String(b.name ?? "")));

  if (!availableItems.length) {
    container.innerHTML = `<div class="stock-picker-empty">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  let currentGroup = "";
  container.innerHTML = availableItems.map((item) => {
    const groupLabel = String(item.model ?? "Other").trim() || "Other";
    const groupMarkup = groupLabel !== currentGroup
      ? `<div class="stock-picker-group">${escapeHtml(groupLabel)}</div>`
      : "";
    currentGroup = groupLabel;

    const ownQuantity = Number(item.ownQuantity ?? item.quantity ?? 0);
    const consignmentQuantity = Number(item.consignmentQuantity ?? 0);
    const consignmentMetrics = consignmentQuantity > 0
      ? `<span class="stock-picker-chip-consign"><span class="stock-picker-chip-label">Consignment</span><strong>${consignmentQuantity}</strong></span>`
      : "";
    const totalMetric = consignmentQuantity > 0
      ? `<span class="stock-picker-chip-total"><span class="stock-picker-chip-label">Total</span><strong>${Number(item.quantity ?? 0)}</strong></span>`
      : "";

    return `
      ${groupMarkup}
      <button type="button" class="stock-picker-option${item.id === selectedId ? " is-selected" : ""}" data-stock-picker-option="${item.id}" role="option" aria-selected="${item.id === selectedId ? "true" : "false"}">
        <span class="stock-picker-option-main">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.brand ?? "Generic")} / ${escapeHtml(item.sku ?? "-")} / ${escapeHtml(item.location ?? "Main Store")}</span>
        </span>
        <span class="stock-picker-option-metrics">
          <span class="stock-picker-chip-own"><span class="stock-picker-chip-label">LC Stock</span><strong>${ownQuantity}</strong></span>
          ${consignmentMetrics}
          ${totalMetric}
        </span>
      </button>
    `;
  }).join("");
}

function updateStockPickerButton(button, item, options = {}) {
  if (!button) return;
  const quantityLabel = options.quantityLabel ?? "available";
  const placeholderMeta = options.placeholderMeta ?? "Search by description, SKU, brand, or category";
  button.dataset.hasSelection = String(Boolean(item));
  button.innerHTML = item
    ? `
      <span class="stock-picker-button-title">${escapeHtml(item.name)}</span>
      <span class="stock-picker-button-meta">${escapeHtml(item.sku ?? "-")} | ${Number(item.quantity ?? 0)} ${escapeHtml(item.unit ?? "")} ${escapeHtml(quantityLabel)}</span>
    `
    : `
      <span class="stock-picker-button-title">Select an item</span>
      <span class="stock-picker-button-meta">${escapeHtml(placeholderMeta)}</span>
    `;
}

function updateConsignmentRestockNotice(notice, item) {
  if (!notice) return;
  const restockQuantity = item ? getConsignmentUsed(item) : 0;
  notice.hidden = restockQuantity <= 0;
  notice.textContent = restockQuantity > 0
    ? `This item has consignment stock to restock: ${restockQuantity}. Choose Consignment Stock if this delivery is for consignment.`
    : "";
}

function normalizeStockOutItems(record, inventory) {
  if (Array.isArray(record.items) && record.items.length) {
    return record.items.map((line) => ({
      ...line,
      ownQuantity: line.ownQuantity ?? line.quantity ?? 0,
      consignmentQuantity: line.consignmentQuantity ?? 0,
      ownBalanceAfter: line.ownBalanceAfter ?? (typeof line.balanceAfter === "object" ? line.balanceAfter?.ownQuantity : line.balanceAfter) ?? 0,
      consignmentBalanceAfter: line.consignmentBalanceAfter ?? line.itemSnapshot?.consignmentQuantity ?? 0,
      consignmentToRestock: line.consignmentToRestock ?? line.itemSnapshot?.consignmentToRestock ?? 0
    }));
  }

  const item = record.itemSnapshot ?? inventory.find((entry) => entry.id === record.itemId);
  return [{
    itemId: record.itemId,
    quantity: record.quantity,
    ownQuantity: record.ownQuantity ?? record.quantity,
    consignmentQuantity: record.consignmentQuantity ?? 0,
    balanceAfter: record.balanceAfter ?? 0,
    ownBalanceAfter: record.ownBalanceAfter ?? record.balanceAfter ?? 0,
    consignmentBalanceAfter: record.consignmentBalanceAfter ?? 0,
    consignmentToRestock: record.consignmentToRestock ?? 0,
    itemSnapshot: item
      ? {
          brand: item.brand,
          model: item.model,
          name: item.name,
          sku: item.sku,
          unit: item.unit,
          location: item.location,
          ownQuantity: item.ownQuantity,
          consignmentQuantity: item.consignmentQuantity,
          consignmentBaseline: item.consignmentBaseline,
          consignmentToRestock: getConsignmentUsed(item),
          quantity: item.quantity
        }
      : null
  }];
}

function renderStockOutIssueList(container, emptyState, summary, inventory) {
  if (!container) return;

  const rows = Array.from(container.querySelectorAll("[data-stock-out-item-row]"));
  emptyState.hidden = rows.length > 0;

  if (!rows.length) {
    summary.textContent = "No items in issue list";
    return;
  }

  const totalLines = rows.length;
  let totalOwnQuantity = 0;
  let totalConsignmentQuantity = 0;

  rows.forEach((row) => {
    const item = inventory.find((entry) => entry.id === row.dataset.itemId);
    const issueSource = row.dataset.issueSource === "consignment" ? "consignment" : "own";
    const qty = Number(row.querySelector('input[name="issueQuantity"]')?.value ?? "0");
    if (issueSource === "consignment") {
      totalConsignmentQuantity += Math.max(qty, 0);
    } else {
      totalOwnQuantity += Math.max(qty, 0);
    }
    const availableCell = row.querySelector("[data-stock-out-available]");
    if (availableCell) {
      availableCell.innerHTML = item ? renderStockBreakdownChips(item) : "-";
    }
    const consignmentNotice = row.querySelector("[data-stock-out-consignment-notice]");
    if (consignmentNotice) {
      const availableForSource = issueSource === "consignment"
        ? Number(item?.consignmentQuantity ?? 0)
        : Number(item?.ownQuantity ?? item?.quantity ?? 0);
      const noticeText = item && qty > availableForSource
        ? `Only ${availableForSource} ${issueSource === "consignment" ? "consignment" : "LC Stock"} available`
        : "";
      consignmentNotice.hidden = !noticeText;
      consignmentNotice.textContent = noticeText;
    }
  });

  summary.textContent = `${totalLines} item line${totalLines === 1 ? "" : "s"} | LC Stock ${totalOwnQuantity} | Consignment ${totalConsignmentQuantity}`;
}

function getActivityEvents(data) {
  const inventoryCreates = data.inventory.map((item) => ({
    id: `create-${item.id}`,
    type: "create",
    sourceId: item.id,
    title: "New Stock Created",
    actor: item.createdByName ?? "Unknown User",
    itemSummary: item.name ?? item.sku ?? "Inventory item",
    itemLines: [item.name ?? item.sku ?? "Inventory item"],
    detail: `${item.brand ?? "Generic"} | ${item.sku ?? "-"}`,
    quantityText: formatLineItemCount(1),
    createdAt: item.createdAt,
    actions: []
  }));

  const stockInGroups = data.adjustments.reduce((groups, entry) => {
    const groupKey = entry.stockInSessionId
      ?? `${entry.createdAt ?? ""}|${entry.actorUserId ?? entry.actorName ?? ""}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(entry);
    return groups;
  }, new Map());

  const stockIns = Array.from(stockInGroups.entries()).map(([groupKey, entries]) => {
    const firstEntry = entries[0] ?? {};
    const itemRows = entries.map((entry) => {
      const item = data.inventory.find((record) => record.id === entry.itemId);
      return {
        entry,
        item,
        itemName: item?.name ?? "Deleted item",
        itemLine: item?.name ?? "Deleted item"
      };
    });
    const totalQuantity = entries.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    const lineItemCount = itemRows.length;
    return {
      id: `adjust-${groupKey}`,
      type: "stock-in",
      sourceId: groupKey,
      title: "Stock Added",
      actor: firstEntry.actorName ?? "Unknown User",
      itemSummary: itemRows.map((row) => row.itemName).join(", "),
      itemLines: itemRows.map((row) => row.itemLine),
      detail: `Total received +${totalQuantity}`,
      detailRows: [
        { label: "Total received", value: `+${totalQuantity}` }
      ],
      quantityText: formatLineItemCount(lineItemCount),
      createdAt: firstEntry.createdAt,
      actions: []
    };
  });

  const stockOuts = data.stockOuts.map((entry) => {
    const items = normalizeStockOutItems(entry, data.inventory);
    const itemLines = items.map((line) => line.itemSnapshot?.name ?? "Item");
    const itemSummary = itemLines.join(", ");
    const totalQuantity = items.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    return {
      id: `draw-${entry.id}`,
      type: "stock-out",
      sourceId: entry.id,
      title: "Stock Drawn Out",
      actor: entry.createdByName ?? "Unknown User",
      itemSummary,
      itemLines,
      detail: `Total issued -${totalQuantity} | Document ${entry.documentNo} | Received by ${entry.receivedBy}`,
      detailRows: [
        { label: "Total issued", value: `-${totalQuantity}` },
        { label: "Document", value: entry.documentNo ?? "-" },
        { label: "Received by", value: entry.receivedBy ?? "-" }
      ],
      quantityText: formatLineItemCount(items.length),
      createdAt: entry.createdAt,
      actions: [
        { kind: "view-handover", label: "View Form", stockOutId: entry.id },
        { kind: "download-handover", label: "Download Form", stockOutId: entry.id }
      ]
    };
  });

  const relocations = (data.relocations ?? []).map((entry) => {
    const item = data.inventory.find((record) => record.id === entry.itemId);
    const snapshot = entry.itemSnapshot ?? item ?? {};
    return {
      id: `relocate-${entry.id}`,
      type: "relocate",
      sourceId: entry.id,
      title: "Stock Relocated",
      actor: entry.actorName ?? "Unknown User",
      itemSummary: snapshot.name ?? snapshot.sku ?? "Inventory item",
      itemLines: [snapshot.name ?? snapshot.sku ?? "Inventory item"],
      detail: `${entry.fromLocation ?? "-"} to ${entry.toLocation ?? "-"} | ${entry.remarks || "No remarks provided"}`,
      detailRows: [
        { label: "From Location", value: entry.fromLocation ?? "-" },
        { label: "To Location", value: entry.toLocation ?? "-" },
        { label: "Remarks", value: entry.remarks || "No remarks provided" }
      ],
      quantityText: formatLineItemCount(1),
      createdAt: entry.createdAt,
      actions: []
    };
  });

  const corrections = (data.corrections ?? []).map((entry) => {
    const itemLines = (entry.itemRows ?? []).map((row) => row.name ?? row.sku ?? "Item");
    const sourceKind = getCorrectionSourceKind(entry) ?? entry.sourceType;
    const isCreateCorrection = sourceKind === "create";
    const adjustmentSummary = formatAdjustmentBreakdownSummary(entry.itemRows);
    return {
      id: `correction-${entry.id}`,
      type: "correction",
      sourceId: entry.id,
      title: isCreateCorrection ? "Stock Creation Correction" : sourceKind === "stock-out" ? "Stock-Out Correction" : "Stock-In Correction",
      actor: entry.actorName ?? "Unknown User",
      itemSummary: itemLines.join(", "),
      itemLines,
      detail: isCreateCorrection
        ? `Item information corrected | ${entry.reason ?? "No reason provided"}`
        : `Inventory adjustment ${adjustmentSummary} | ${entry.reason ?? "No reason provided"}`,
      detailRows: [
        ...(isCreateCorrection ? [{ label: "Change Type", value: "Item information" }] : [{ label: "Inventory adjustment", value: adjustmentSummary }]),
        { label: "Reason", value: entry.reason ?? "No reason provided" }
      ],
      quantityText: formatLineItemCount(itemLines.length),
      createdAt: entry.createdAt,
      actions: []
    };
  });

  return [...inventoryCreates, ...stockIns, ...stockOuts, ...relocations, ...corrections]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getCorrectionChildren(data, sourceType, sourceId) {
  return (data.corrections ?? [])
    .filter((entry) => entry.sourceType === sourceType && entry.sourceId === sourceId)
    .sort((a, b) => new Date(a.createdAt ?? 0) - new Date(b.createdAt ?? 0));
}

function getLatestCorrection(data, sourceType, sourceId) {
  const children = getCorrectionChildren(data, sourceType, sourceId);
  if (!children.length) return null;
  let latest = children[children.length - 1];
  let next = getLatestCorrection(data, "correction", latest.id);
  while (next) {
    latest = next;
    next = getLatestCorrection(data, "correction", latest.id);
  }
  return latest;
}

function getCorrectionSourceKind(correction) {
  if (!correction) return null;
  if (correction.sourceType === "correction") {
    return correction.rootSourceType ?? correction.baseSourceType ?? null;
  }
  return correction.sourceType;
}

function getRootCorrectionSource(data, correction) {
  let current = correction;
  const seen = new Set();
  while (current?.sourceType === "correction" && current.sourceId && !seen.has(current.sourceId)) {
    seen.add(current.sourceId);
    const parent = (data.corrections ?? []).find((entry) => entry.id === current.sourceId);
    if (!parent) break;
    current = parent;
  }
  return {
    type: current?.sourceType ?? correction?.sourceType,
    id: current?.sourceId ?? correction?.sourceId
  };
}

function getCorrectionAuditChain(data, sourceType, sourceId) {
  const chain = [];
  let currentType = sourceType;
  let currentId = sourceId;
  const seen = new Set();

  while (currentType && currentId && !seen.has(`${currentType}:${currentId}`)) {
    seen.add(`${currentType}:${currentId}`);
    const children = getCorrectionChildren(data, currentType, currentId);
    if (!children.length) break;
    const nextCorrection = children[children.length - 1];
    chain.push(nextCorrection);
    currentType = "correction";
    currentId = nextCorrection.id;
  }

  return chain;
}

function getCorrectionChangeSummary(correction) {
  const sourceKind = getCorrectionSourceKind(correction) ?? correction.sourceType;
  if (sourceKind === "create") {
    const changedCount = (correction.itemRows ?? []).reduce((sum, row) => sum + (row.changedFields?.length ?? 0), 0);
    return `${changedCount || "Item"} information field${changedCount === 1 ? "" : "s"} corrected`;
  }
  return `Inventory adjusted ${formatAdjustmentBreakdownSummary(correction.itemRows)}`;
}

function getOriginalAuditRecord(data, sourceType, sourceId) {
  if (!sourceType || !sourceId) return null;
  if (sourceType === "correction") {
    const correction = (data.corrections ?? []).find((entry) => entry.id === sourceId);
    const root = getRootCorrectionSource(data, correction);
    return getOriginalAuditRecord(data, root.type, root.id);
  }
  return getActivityDetailRecord(sourceType, sourceId, data);
}

function getActivityDetailRecord(type, id, data) {
  if (type === "create") {
    const item = data.inventory.find((entry) => entry.id === id);
    if (!item) return null;
    const latestCorrection = getLatestCorrection(data, type, id);
    return {
      type,
      sourceId: item.id,
      title: "Stock Creation Record",
      actor: item.createdByName ?? "Unknown User",
      createdAt: item.createdAt,
      summary: item.name ?? item.sku ?? "Inventory item",
      detailRows: [
        { label: "Brand", value: item.brand ?? "Generic" },
        { label: "Category", value: item.model ?? "Standard" },
        { label: "Stock Code", value: item.sku ?? "-" },
        { label: "Unit", value: item.unit ?? "-" },
        { label: "Location", value: item.location ?? "Main Store" }
      ],
      itemRows: [{
        itemId: item.id,
        brand: item.brand ?? "Generic",
        model: item.model ?? "Standard",
        name: item.name ?? "-",
        sku: item.sku ?? "-",
        quantity: item.quantity ?? 0,
        ownQuantity: item.ownQuantity ?? item.quantity ?? 0,
        consignmentQuantity: item.consignmentQuantity ?? 0,
        consignmentToRestock: getConsignmentUsed(item),
        unit: item.unit ?? "-",
        location: item.location ?? "Main Store"
      }],
      hasCorrection: Boolean(latestCorrection),
      latestCorrectionId: latestCorrection?.id ?? null,
      canCorrect: !latestCorrection,
      handoverId: null
    };
  }

  if (type === "stock-in") {
    let adjustments = data.adjustments.filter((entry) => entry.stockInSessionId === id);
    if (!adjustments.length) {
      const directAdjustment = data.adjustments.find((entry) => entry.id === id);
      if (directAdjustment) {
        const fallbackKey = `${directAdjustment.createdAt ?? ""}|${directAdjustment.actorUserId ?? directAdjustment.actorName ?? ""}`;
        adjustments = data.adjustments.filter((entry) => {
          const entryKey = `${entry.createdAt ?? ""}|${entry.actorUserId ?? entry.actorName ?? ""}`;
          return entryKey === fallbackKey;
        });
      } else {
        adjustments = data.adjustments.filter((entry) => {
          const entryKey = entry.stockInSessionId ?? `${entry.createdAt ?? ""}|${entry.actorUserId ?? entry.actorName ?? ""}`;
          return entryKey === id;
        });
      }
    }
    if (!adjustments.length) return null;
    const latestCorrection = getLatestCorrection(data, type, id);
    const firstAdjustment = adjustments[0];
    const totalQuantity = adjustments.reduce((sum, adjustment) => sum + Number(adjustment.quantity || 0), 0);
    const lcQuantity = adjustments
      .filter((adjustment) => adjustment.stockType !== "consignment")
      .reduce((sum, adjustment) => sum + Number(adjustment.quantity || 0), 0);
    const consignQuantity = adjustments
      .filter((adjustment) => adjustment.stockType === "consignment")
      .reduce((sum, adjustment) => sum + Number(adjustment.quantity || 0), 0);
    const detailRows = [
      { label: "Total Quantity Added", value: `+${totalQuantity}` },
      ...(lcQuantity ? [{ label: "LC Stock Added", value: `+${lcQuantity}` }] : []),
      ...(consignQuantity ? [{ label: "Consignment Added", value: `+${consignQuantity}` }] : []),
      { label: "Remarks", value: firstAdjustment.remarks || "No remarks provided" }
    ];
    return {
      type,
      title: "Stock-In Record",
      actor: firstAdjustment.actorName ?? "Unknown User",
      createdAt: firstAdjustment.createdAt,
      summary: `${adjustments.length} stock-in line${adjustments.length === 1 ? "" : "s"}`,
      detailRows,
      itemRows: adjustments.map((adjustment) => {
        const item = data.inventory.find((entry) => entry.id === adjustment.itemId);
        return {
          brand: item?.brand ?? "Generic",
          model: item?.model ?? "Standard",
          name: item?.name ?? "Deleted item",
          itemId: adjustment.itemId,
          stockType: adjustment.stockType ?? "own",
          sku: item?.sku ?? "-",
          quantity: adjustment.quantity ?? 0,
          ownQuantity: adjustment.stockType === "consignment" ? 0 : adjustment.quantity ?? 0,
          consignmentQuantity: adjustment.stockType === "consignment" ? adjustment.quantity ?? 0 : 0,
          consignmentToRestock: item ? getConsignmentUsed(item) : 0,
          balanceBefore: adjustment.balanceBefore ?? null,
          balanceAfter: adjustment.balanceAfter ?? null,
          unit: item?.unit ?? "-",
          location: item?.location ?? "Main Store"
        };
      }),
      balanceRows: adjustments.map((adjustment) => {
        const item = data.inventory.find((entry) => entry.id === adjustment.itemId);
        return {
          name: item?.name ?? "Deleted item",
          sku: item?.sku ?? "-",
          balanceBefore: adjustment.balanceBefore ?? null,
          balanceAfter: adjustment.balanceAfter ?? null
        };
      }),
      hasCorrection: Boolean(latestCorrection),
      latestCorrectionId: latestCorrection?.id ?? null,
      canCorrect: !latestCorrection,
      handoverId: null
    };
  }

  if (type === "stock-out") {
    const stockOut = data.stockOuts.find((entry) => entry.id === id);
    if (!stockOut) return null;
    const latestCorrection = getLatestCorrection(data, type, id);
    const items = normalizeStockOutItems(stockOut, data.inventory);
    const balanceRows = items.map((line) => {
      const hasBalanceAfterSnapshot = line.balanceAfter && typeof line.balanceAfter === "object";
      const hasBalanceBeforeSnapshot = line.balanceBefore && typeof line.balanceBefore === "object";
      const balanceAfter = hasBalanceAfterSnapshot
        ? line.balanceAfter
        : {
            quantity: Number(line.balanceAfter ?? line.itemSnapshot?.quantity ?? 0),
            ownQuantity: Number(line.ownBalanceAfter ?? line.itemSnapshot?.ownQuantity ?? 0),
            consignmentQuantity: Number(line.consignmentBalanceAfter ?? line.itemSnapshot?.consignmentQuantity ?? 0),
            consignmentBaseline: Number(line.itemSnapshot?.consignmentBaseline ?? line.consignmentBalanceAfter ?? 0),
            consignmentToRestock: Number(line.consignmentToRestock ?? line.itemSnapshot?.consignmentToRestock ?? 0)
          };
      const balanceBefore = hasBalanceBeforeSnapshot
        ? line.balanceBefore
        : {
            quantity: Number(balanceAfter.quantity ?? 0) + Number(line.quantity ?? 0),
            ownQuantity: Number(balanceAfter.ownQuantity ?? 0) + Number(line.ownQuantity ?? 0),
            consignmentQuantity: Number(balanceAfter.consignmentQuantity ?? 0) + Number(line.consignmentQuantity ?? 0),
            consignmentBaseline: Number(balanceAfter.consignmentBaseline ?? line.itemSnapshot?.consignmentBaseline ?? 0),
            consignmentToRestock: Math.max(Number(balanceAfter.consignmentBaseline ?? 0) - (Number(balanceAfter.consignmentQuantity ?? 0) + Number(line.consignmentQuantity ?? 0)), 0)
          };
      return {
        name: line.itemSnapshot?.name ?? "Deleted item",
        sku: line.itemSnapshot?.sku ?? "-",
        balanceBefore,
        balanceAfter
      };
    });
    const consignmentIssued = items.reduce((sum, line) => sum + Number(line.consignmentQuantity || 0), 0);
    return {
      type,
      title: "Stock-Out Record",
      actor: stockOut.createdByName ?? "Unknown User",
      createdAt: stockOut.createdAt,
      summary: stockOut.projectTitle || stockOut.documentNo,
      detailRows: [
        { label: "Document No", value: stockOut.documentNo ?? "-" },
        { label: "Project Title", value: stockOut.projectTitle ?? "-" },
        { label: "Received By", value: stockOut.receivedBy ?? "-" },
        ...(consignmentIssued ? [{ label: "Consignment Issued", value: consignmentIssued }] : [])
      ],
      itemRows: items.map((line) => ({
        brand: line.itemSnapshot?.brand ?? "-",
        model: line.itemSnapshot?.model ?? "-",
        name: line.itemSnapshot?.name ?? "-",
        itemId: line.itemId,
        sku: line.itemSnapshot?.sku ?? "-",
        quantity: line.quantity ?? 0,
        unit: line.itemSnapshot?.unit ?? "-",
        location: line.itemSnapshot?.location ?? "-",
        balanceAfter: typeof line.balanceAfter === "object" ? line.balanceAfter.quantity ?? 0 : line.balanceAfter ?? 0,
        ownQuantity: line.ownQuantity ?? line.quantity ?? 0,
        consignmentQuantity: line.consignmentQuantity ?? 0,
        consignmentToRestock: line.consignmentToRestock ?? 0
      })),
      balanceRows,
      hasCorrection: Boolean(latestCorrection),
      latestCorrectionId: latestCorrection?.id ?? null,
      canCorrect: !latestCorrection,
      handoverId: stockOut.id
    };
  }

  if (type === "relocate") {
    const relocation = (data.relocations ?? []).find((entry) => entry.id === id);
    if (!relocation) return null;
    const item = data.inventory.find((entry) => entry.id === relocation.itemId);
    const snapshot = relocation.itemSnapshot ?? item ?? {};
    return {
      type,
      sourceId: relocation.id,
      title: "Stock Relocation Record",
      actor: relocation.actorName ?? "Unknown User",
      createdAt: relocation.createdAt,
      summary: snapshot.name ?? snapshot.sku ?? "Inventory item",
      detailRows: [
        { label: "From Location", value: relocation.fromLocation ?? "-" },
        { label: "To Location", value: relocation.toLocation ?? "-" },
        { label: "Remarks", value: relocation.remarks || "No remarks provided" }
      ],
      itemRows: [{
        itemId: relocation.itemId,
        brand: snapshot.brand ?? "Generic",
        model: snapshot.model ?? "Standard",
        name: snapshot.name ?? "-",
        sku: snapshot.sku ?? "-",
        quantity: snapshot.quantity ?? item?.quantity ?? 0,
        unit: snapshot.unit ?? item?.unit ?? "-",
        fromLocation: relocation.fromLocation ?? "-",
        toLocation: relocation.toLocation ?? "-"
      }],
      balanceRows: [],
      hasCorrection: false,
      latestCorrectionId: null,
      canCorrect: false,
      handoverId: null
    };
  }

  if (type === "correction") {
    const correction = (data.corrections ?? []).find((entry) => entry.id === id);
    if (!correction) return null;
    const latestCorrection = getLatestCorrection(data, "correction", id);
    const rootSource = getRootCorrectionSource(data, correction);
    const sourceKind = getCorrectionSourceKind(correction) ?? rootSource.type ?? correction.sourceType;
    const isCreateCorrection = sourceKind === "create";
    const originalRecord = correction.sourceType && correction.sourceId
      ? getActivityDetailRecord(correction.sourceType, correction.sourceId, data)
      : null;
    const getCorrectedMovementBreakdown = (row) => ({
      ownQuantity: Number(row.correctedValues?.ownQuantity ?? row.ownQuantity ?? 0),
      consignmentQuantity: Number(row.correctedValues?.consignmentQuantity ?? row.consignmentQuantity ?? 0)
    });
    const getPreviousMovementBreakdown = (row) => {
      const correctedBreakdown = getCorrectedMovementBreakdown(row);
      const ownDelta = Number(row.ownDelta ?? 0);
      const consignmentDelta = Number(row.consignmentDelta ?? 0);
      return sourceKind === "stock-out"
        ? {
            ownQuantity: correctedBreakdown.ownQuantity + ownDelta,
            consignmentQuantity: correctedBreakdown.consignmentQuantity + consignmentDelta
          }
        : {
            ownQuantity: correctedBreakdown.ownQuantity - ownDelta,
            consignmentQuantity: correctedBreakdown.consignmentQuantity - consignmentDelta
          };
    };
    return {
      type,
      sourceType: correction.sourceType,
      rootSourceType: rootSource.type,
      rootSourceId: rootSource.id,
      title: isCreateCorrection ? "Stock Creation Correction Record" : sourceKind === "stock-out" ? "Stock-Out Correction Record" : "Stock-In Correction Record",
      actor: correction.actorName ?? "Unknown User",
      createdAt: correction.createdAt,
      summary: `Correction for ${isCreateCorrection ? "stock creation" : sourceKind === "stock-out" ? "stock-out" : "stock-in"} record`,
      detailRows: [
        {
          label: "Original Record",
          value: correction.sourceId ?? "-",
          href: correction.sourceType && correction.sourceId
            ? `activity-detail.html?type=${encodeURIComponent(correction.sourceType)}&id=${encodeURIComponent(correction.sourceId)}`
            : null,
          displayTitle: originalRecord?.title ?? "Open original transaction",
          displaySummary: originalRecord?.summary ?? (isCreateCorrection ? "Stock creation record" : sourceKind === "stock-out" ? "Stock-out transaction" : "Stock-in transaction"),
          displayMeta: originalRecord
            ? `${formatDateTime(originalRecord.createdAt)} | ${originalRecord.actor}`
            : null
        },
        isCreateCorrection
          ? { label: "Change Type", value: "Item information" }
          : { label: "Inventory Adjustment", value: formatAdjustmentBreakdownSummary(correction.itemRows) },
        { label: "Reason", value: correction.reason ?? "No reason provided" }
      ].filter(Boolean),
      itemRows: (correction.itemRows ?? []).map((row) => {
        const previousBreakdown = getPreviousMovementBreakdown(row);
        const correctedBreakdown = getCorrectedMovementBreakdown(row);
        return {
        brand: row.brand ?? "-",
        model: row.model ?? "-",
        name: row.name ?? "-",
        itemId: row.itemId,
        sku: row.sku ?? "-",
        quantity: row.correctedValues?.quantity ?? row.quantity ?? row.quantityDelta ?? 0,
        stockType: row.correctedValues?.stockType ?? row.stockType ?? "own",
        ownQuantity: row.correctedValues?.ownQuantity ?? row.ownQuantity ?? row.ownDelta ?? 0,
        consignmentQuantity: row.correctedValues?.consignmentQuantity ?? row.consignmentQuantity ?? row.consignmentDelta ?? 0,
        quantityDelta: row.quantityDelta ?? 0,
        ownDelta: row.ownDelta ?? 0,
        consignmentDelta: row.consignmentDelta ?? 0,
        previousOwnMovementQuantity: previousBreakdown.ownQuantity,
        previousConsignmentMovementQuantity: previousBreakdown.consignmentQuantity,
        correctedOwnMovementQuantity: correctedBreakdown.ownQuantity,
        correctedConsignmentMovementQuantity: correctedBreakdown.consignmentQuantity,
        consignmentToRestock: row.balanceAfter?.consignmentToRestock ?? 0,
        unit: row.unit ?? "-",
        location: row.location ?? "-",
        balanceAfter: row.balanceAfter?.quantity ?? 0,
        previousValues: row.previousValues ?? null,
        correctedValues: row.correctedValues ?? null,
        changedFields: row.changedFields ?? []
      };
      }),
      balanceRows: isCreateCorrection ? [] : (correction.itemRows ?? []).map((row) => ({
        name: row.name ?? "Deleted item",
        sku: row.sku ?? "-",
        balanceBefore: row.balanceBefore ?? null,
        balanceAfter: row.balanceAfter ?? null
      })),
      hasCorrection: Boolean(latestCorrection),
      latestCorrectionId: latestCorrection?.id ?? null,
      canCorrect: !latestCorrection,
      handoverId: null
    };
  }

  return null;
}

function buildHandoverDocumentMarkup(record, items) {
  const companyLogoMarkup = `
    <div class="company-logo-mark" aria-label="Links Creation">
      <div class="company-logo-text">
        <strong><span>LINKS</span> CREATION</strong>
        <small>Linking People, Creating Business</small>
      </div>
      <svg class="company-logo-rings" viewBox="0 0 96 52" aria-hidden="true" focusable="false">
        <ellipse cx="38" cy="26" rx="34" ry="12" transform="rotate(-26 38 26)" fill="none" stroke="#008a39" stroke-width="5" />
        <ellipse cx="50" cy="26" rx="34" ry="12" transform="rotate(-26 50 26)" fill="none" stroke="#124da1" stroke-width="5" />
        <ellipse cx="64" cy="26" rx="30" ry="12" transform="rotate(-57 64 26)" fill="none" stroke="#e4252b" stroke-width="5" />
      </svg>
    </div>
  `;
  return `
    <section class="print-header">
      <div class="print-brand-block">
        ${companyLogoMarkup}
        <div class="print-title-block">
          <p class="eyebrow">Controlled Material Handover</p>
          <h1>Material Handover Form</h1>
          <p class="print-muted">Formal acknowledgment for internal or external material issuance.</p>
        </div>
      </div>
      <div class="print-document-box">
        <p><span>Form No.</span><strong>${escapeHtml(record.documentNo)}</strong></p>
        <p><span>Date</span><strong>${formatDateTime(record.createdAt)}</strong></p>
      </div>
    </section>

    <section class="print-section print-detail-panel">
      <div class="print-section-title">
        <span>01</span>
        <h2>Handover Details</h2>
      </div>
      <div class="print-field-grid">
        <div class="print-field"><span>Project / Work Order</span><strong>${escapeHtml(record.projectTitle ?? "-")}</strong></div>
        <div class="print-field"><span>Issued To</span><strong>${escapeHtml(record.receivedBy ?? "-")}</strong></div>
        <div class="print-field"><span>Prepared By</span><strong>${escapeHtml(record.createdByName ?? "Unknown User")}</strong></div>
      </div>
    </section>

    <section class="print-section handover-items-section">
      <div class="print-section-title">
        <span>02</span>
        <h2>Issued Items</h2>
      </div>
      <table class="handover-items-table">
        <thead>
          <tr>
            <th>No.</th>
            <th>Brand</th>
            <th>Category</th>
            <th>Description</th>
            <th>Stock Code</th>
            <th>Total Qty</th>
            <th>Unit</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((line, index) => {
            const item = line.itemSnapshot ?? {};
            return `
              <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(item.brand ?? "-")}</td>
                <td>${escapeHtml(item.model ?? "-")}</td>
                <td>${escapeHtml(item.name ?? "-")}</td>
                <td>${escapeHtml(item.sku ?? "-")}</td>
                <td>${line.quantity}</td>
                <td>${escapeHtml(item.unit ?? "-")}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </section>

    <section class="print-section handover-acknowledgement">
      <div class="print-section-title">
        <span>03</span>
        <h2>Acknowledgment</h2>
      </div>
      <p>The items listed above have been handed over in the quantities stated. The receiver acknowledges receipt of the materials and agrees to notify the issuing party promptly if any discrepancy is found.</p>
    </section>

    <section class="signatures">
      <div class="signature-box">
        <span class="signature-role">Issued By</span>
        <div class="signature-line"><strong>${escapeHtml(record.createdByName ?? "Issued By")}</strong></div>
        <span>Name / Signature / Date</span>
      </div>
      <div class="signature-box">
        <span class="signature-role">Received By</span>
        <div class="signature-line"></div>
        <span>Name / Signature / Date</span>
      </div>
    </section>

    <footer class="print-footer">
      <span>${escapeHtml(record.documentNo)}</span>
      <span>Computer-generated document</span>
    </footer>
  `;
}

function downloadHandoverFile(stockOutId) {
  const data = loadData();
  const record = data.stockOuts.find((entry) => entry.id === stockOutId);
  if (!record) return;

  const items = normalizeStockOutItems(record, data.inventory);
  const documentMarkup = buildHandoverDocumentMarkup(record, items);
  const stylesheetText = Array.from(document.styleSheets)
    .map((styleSheet) => {
      try {
        return Array.from(styleSheet.cssRules).map((rule) => rule.cssText).join("\n");
      } catch (error) {
        return "";
      }
    })
    .filter(Boolean)
    .join("\n");
  const exportHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(record.documentNo)} | Material Handover Form</title>
  <style>${stylesheetText}</style>
</head>
<body class="print-page">
  <main class="print-shell">
    ${documentMarkup}
  </main>
</body>
</html>`;

  const blob = new Blob([exportHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${record.documentNo || "handover-form"}.html`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function applyActivityCorrection(type, id, form) {
  const data = loadData();
  const record = getActivityDetailRecord(type, id, data);
  const currentUser = getCurrentUser();
  const reason = form.querySelector("#correction-reason")?.value.trim() ?? "";
  const correctionKind = getCorrectableRecordKind(record);
  if (!record || !["create", "stock-in", "stock-out"].includes(correctionKind)) return { ok: false, message: "This activity record cannot be corrected." };
  if (!canCorrectActivityRecord(record, currentUser)) {
    return { ok: false, message: `You do not have permission to correct this ${correctionKind === "create" ? "stock creation" : correctionKind} record. Required role: ${getCorrectionPermissionLabel(correctionKind)}.` };
  }
  if (!reason) return { ok: false, message: "Enter a correction reason before saving." };
  if ((data.corrections ?? []).some((entry) => entry.sourceType === type && entry.sourceId === id)) {
    return { ok: false, message: "This record already has a correction. Review the correction record before applying another change." };
  }

  const rows = [];
  if (correctionKind === "create") {
    const correctedValues = {
      brand: String(form.elements["correctBrand-0"]?.value ?? "").trim().replace(/\s+/g, " "),
      model: String(form.elements["correctCategory-0"]?.value ?? "").trim().replace(/\s+/g, " "),
      name: String(form.elements["correctName-0"]?.value ?? "").trim().replace(/\s+/g, " "),
      sku: String(form.elements["correctSku-0"]?.value ?? "").trim().replace(/\s+/g, " "),
      unit: String(form.elements["correctUnit-0"]?.value ?? "").trim().replace(/\s+/g, " "),
      location: String(form.elements["correctLocation-0"]?.value ?? "").trim().replace(/\s+/g, " ")
    };
    if (Object.values(correctedValues).some((value) => !value)) {
      return { ok: false, message: "Please complete all item information before saving." };
    }
    rows.push({ correctedValues });
  } else {
    Array.from(form.querySelectorAll("[data-correction-row]")).forEach((row, index) => {
      if (correctionKind === "stock-in") {
        rows.push({
          correctedValues: {
            quantity: Math.max(Number(form.elements[`correctQuantity-${index}`]?.value ?? 0), 0),
            stockType: form.elements[`correctStockType-${index}`]?.value === "consignment" ? "consignment" : "own"
          }
        });
      } else {
        rows.push({
          correctedValues: {
            ownQuantity: Math.max(Number(form.elements[`correctOwn-${index}`]?.value ?? 0), 0),
            consignmentQuantity: Math.max(Number(form.elements[`correctConsignment-${index}`]?.value ?? 0), 0)
          }
        });
      }
    });
  }

  try {
    const result = await sendBackendAction("correct-activity", { type, id, reason, rows });
    return { ok: true, correctionId: result.correction?.id };
  } catch (error) {
    return { ok: false, message: error.message || "The correction could not be saved to the backend." };
  }
}

function renderAdjustmentIssueList(container, emptyState, summary, inventory) {
  if (!container) return;

  const rows = Array.from(container.querySelectorAll("[data-adjustment-item-row]"));
  emptyState.hidden = rows.length > 0;

  if (!rows.length) {
    summary.textContent = "No items in stock-in list";
    return;
  }

  const totalLines = rows.length;
  const totalQuantity = rows.reduce((sum, row) => {
    const qty = Number(row.querySelector('input[name="adjustmentQuantity"]')?.value ?? "0");
    return sum + Math.max(qty, 0);
  }, 0);

  rows.forEach((row) => {
    const item = inventory.find((entry) => entry.id === row.dataset.itemId);
    const purpose = row.dataset.receivingPurpose === "consignment" ? "consignment" : "own";
    const qty = Number(row.querySelector('input[name="adjustmentQuantity"]')?.value ?? "0");
    const stockCell = row.querySelector("[data-adjustment-current-stock]");
    if (stockCell) {
      stockCell.innerHTML = item ? renderStockBreakdownChips(item) : "-";
    }
    const allocationCell = row.querySelector("[data-adjustment-allocation]");
    if (allocationCell) {
      allocationCell.innerHTML = item
        ? renderStockInAllocationChips(item, qty, purpose)
        : "-";
    }
  });

  summary.textContent = `${totalLines} item line${totalLines === 1 ? "" : "s"} | Total quantity to add ${totalQuantity}`;
}

function getUniqueInventoryValues(inventory, key) {
  return Array.from(new Set(
    inventory
      .map((item) => String(item[key] ?? "").trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function populateFilterSelect(select, values, selectedValue, defaultLabel) {
  if (!select) return;

  const safeSelectedValue = values.includes(selectedValue) ? selectedValue : "all";
  select.innerHTML = [
    `<option value="all">${escapeHtml(defaultLabel)}</option>`,
    ...values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
  ].join("");
  select.value = safeSelectedValue;
}

function syncCustomSelect(select) {
  const customSelect = select?.nextElementSibling?.classList.contains("custom-select")
    ? select.nextElementSibling
    : null;
  if (!select || !customSelect) return;

  const button = customSelect.querySelector("[data-custom-select-button]");
  const list = customSelect.querySelector("[data-custom-select-list]");
  const selectedOption = select.selectedOptions[0] ?? select.options[0];
  const hasSelectedValue = Boolean(select.value && select.value !== "all");
  customSelect.dataset.hasSelection = String(hasSelectedValue);

  if (button) {
    button.textContent = selectedOption?.textContent ?? "Select";
  }

  if (list) {
    list.innerHTML = Array.from(select.options).map((option) => `
      <button
        type="button"
        class="custom-select-option${option.selected ? " is-selected" : ""}${option.disabled ? " is-disabled" : ""}"
        data-custom-select-option="${escapeHtml(option.value)}"
        role="option"
        aria-selected="${option.selected ? "true" : "false"}"
        ${option.disabled ? "disabled" : ""}
      >${escapeHtml(option.textContent)}</button>
    `).join("");
  }
}

function closeCustomSelects(except = null) {
  document.querySelectorAll(".custom-select.is-open").forEach((customSelect) => {
    if (customSelect === except) return;
    customSelect.classList.remove("is-open");
    customSelect.querySelector("[data-custom-select-button]")?.setAttribute("aria-expanded", "false");
    const list = customSelect.querySelector("[data-custom-select-list]");
    if (list) list.hidden = true;
  });
}

function enhanceFilterSelects(scope = document) {
  scope.querySelectorAll(".filter-field-select select, .custom-select-field select").forEach((select) => {
    if (!select.dataset.customSelectBound) {
      const customSelect = document.createElement("div");
      customSelect.className = "custom-select";
      customSelect.innerHTML = `
        <button class="custom-select-button" type="button" data-custom-select-button aria-haspopup="listbox" aria-expanded="false"></button>
        <div class="custom-select-list" data-custom-select-list role="listbox" hidden></div>
      `;
      select.classList.add("native-select-hidden");
      select.insertAdjacentElement("afterend", customSelect);

      const button = customSelect.querySelector("[data-custom-select-button]");
      const list = customSelect.querySelector("[data-custom-select-list]");

      button?.addEventListener("click", (event) => {
        event.preventDefault();
        const nextOpen = !customSelect.classList.contains("is-open");
        closeCustomSelects(customSelect);
        customSelect.classList.toggle("is-open", nextOpen);
        button.setAttribute("aria-expanded", String(nextOpen));
        if (list) list.hidden = !nextOpen;
      });

      list?.addEventListener("click", (event) => {
        const option = event.target.closest("[data-custom-select-option]");
        if (!option || option.disabled) return;
        select.value = option.dataset.customSelectOption;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        syncCustomSelect(select);
        closeCustomSelects();
      });

      select.addEventListener("change", () => syncCustomSelect(select));
      select.dataset.customSelectBound = "true";
    }

    syncCustomSelect(select);
  });
}

function initCustomSelectDismissal() {
  if (document.body.dataset.customSelectDismissalBound) return;

  document.addEventListener("click", (event) => {
    if (event.target.closest(".custom-select")) return;
    closeCustomSelects();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCustomSelects();
    }
  });

  document.body.dataset.customSelectDismissalBound = "true";
}

function getValidFilterValue(currentValue, storedValue, values) {
  const preferredValue = storedValue ?? currentValue;
  return values.includes(preferredValue) ? preferredValue : "all";
}

function renderInventoryPage() {
  const data = loadData();
  const diagnostics = getStoredInventoryDiagnostics();
  const summary = document.querySelector("#inventory-summary");
  const tableBody = document.querySelector("#inventory-table");
  const paginationSummary = document.querySelector("#inventory-pagination-summary");
  const pagination = document.querySelector("#inventory-pagination");
  const searchInput = document.querySelector("#inventory-search");
  const brandFilter = document.querySelector("#inventory-brand-filter");
  const modelFilter = document.querySelector("#inventory-model-filter");
  const conditionFilter = document.querySelector("#inventory-condition-filter");
  const pageSizeSelect = document.querySelector("#inventory-page-size");
  const clearFiltersButton = document.querySelector("#inventory-clear-filters");
  const pageKey = "ims-inventory-page";
  const searchKey = "ims-inventory-search";
  const brandKey = "ims-inventory-brand-filter";
  const modelKey = "ims-inventory-model-filter";
  const conditionKey = "ims-inventory-condition-filter";
  const pageSizeKey = "ims-inventory-page-size";
  localStorage.removeItem("ims-inventory-location-filter");
  const rawSearch = localStorage.getItem(searchKey) ?? searchInput?.value ?? "";
  const searchTerm = rawSearch.trim().toLowerCase();
  const brands = getUniqueInventoryValues(data.inventory, "brand");
  const models = getUniqueInventoryValues(data.inventory, "model");
  const activeBrand = getValidFilterValue(brandFilter?.value, localStorage.getItem(brandKey), brands);
  const activeCategory = getValidFilterValue(modelFilter?.value, localStorage.getItem(modelKey), models);
  const rawConditionFilter = localStorage.getItem(conditionKey) ?? conditionFilter?.value ?? "all";
  const activeCondition = ["all", "new", "used"].includes(rawConditionFilter) ? rawConditionFilter : "all";
  const selectedPageSize = Number(localStorage.getItem(pageSizeKey) ?? pageSizeSelect?.value ?? String(INVENTORY_PAGE_SIZE));
  const pageSize = [8, 20, 50, 100].includes(selectedPageSize) ? selectedPageSize : INVENTORY_PAGE_SIZE;
  const totalQuantity = data.inventory.reduce((sum, item) => sum + Math.max(item.quantity, 0), 0);
  const totalOwnQuantity = data.inventory.reduce((sum, item) => sum + Math.max(item.ownQuantity ?? item.quantity ?? 0, 0), 0);
  const totalConsignmentQuantity = data.inventory.reduce((sum, item) => sum + Math.max(item.consignmentQuantity ?? 0, 0), 0);
  const totalConsignmentToRestock = data.inventory.reduce((sum, item) => sum + getConsignmentUsed(item), 0);
  const lowStockItems = data.inventory.filter((item) => item.quantity <= (item.reorderLevel ?? 0));
  const outOfStockItems = data.inventory.filter((item) => item.quantity <= 0);

  if (searchInput && searchInput.value !== rawSearch) {
    searchInput.value = rawSearch;
  }

  populateFilterSelect(brandFilter, brands, activeBrand, "All brands");
  populateFilterSelect(modelFilter, models, activeCategory, "All categories");

  if (conditionFilter && conditionFilter.value !== activeCondition) {
    conditionFilter.value = activeCondition;
  }

  if (pageSizeSelect && String(pageSizeSelect.value) !== String(pageSize)) {
    pageSizeSelect.value = String(pageSize);
  }

  enhanceFilterSelects(document);

  if (summary) {
    summary.innerHTML = `
      <div class="summary-line"><strong>${data.inventory.length}</strong><span>Items in register</span></div>
      <div class="summary-line"><strong>${totalQuantity}</strong><span>Total on hand (${totalOwnQuantity} LC Stock / ${totalConsignmentQuantity} consignment)</span></div>
      <div class="summary-line"><strong>${totalConsignmentToRestock}</strong><span>Consignment to restock</span></div>
    `;
  }

  const filteredInventory = data.inventory.filter((item) => {
    const matchesSearch = !searchTerm || [
      item.brand,
      item.model,
      item.name,
      item.sku,
      item.location
    ].some((value) => String(value ?? "").toLowerCase().includes(searchTerm));

    if (!matchesSearch) return false;
    if (activeBrand !== "all" && item.brand !== activeBrand) return false;
    if (activeCategory !== "all" && item.model !== activeCategory) return false;
    if (activeCondition !== "all" && normalizeStockCondition(item.stockCondition) !== activeCondition) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredInventory.length / pageSize));
  const currentPage = Math.min(Math.max(Number(localStorage.getItem(pageKey) || "1"), 1), totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageItems = filteredInventory.slice(startIndex, endIndex);
  const hasActiveFilters = Boolean(searchTerm)
    || activeBrand !== "all"
    || activeCategory !== "all"
    || activeCondition !== "all";

  paginationSummary.textContent = filteredInventory.length
    ? `Showing ${startIndex + 1}-${Math.min(endIndex, filteredInventory.length)} of ${filteredInventory.length}${hasActiveFilters ? " matching" : ""} items`
    : hasActiveFilters
      ? "No matching inventory items"
      : "No inventory items";

  tableBody.innerHTML = filteredInventory.length
    ? pageItems.map((item) => `
        <tr>
          <td>${escapeHtml(item.brand ?? "Generic")}</td>
          <td>${escapeHtml(item.model ?? "Standard")}</td>
          <td>
            <div class="inventory-description-cell">
              <strong>${escapeHtml(item.name)}</strong>
              ${renderStockConditionBadge(item.stockCondition)}
            </div>
          </td>
          <td>${escapeHtml(item.sku)}</td>
          <td>${renderInventoryBalanceCell(item)}</td>
          <td>${escapeHtml(item.unit ?? "-")}</td>
          <td>${renderConsignmentRestockCell(item)}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="7"><div class="empty-state">${
        hasActiveFilters
          ? "No inventory items matched your current search or filter."
          : "No inventory items yet. Add your first stock record to start operations tracking."
      }<br><span class="muted">Backend data: ${diagnostics.inventoryCount} loaded item${diagnostics.inventoryCount === 1 ? "" : "s"}${diagnostics.parseError ? ` | Data error: ${escapeHtml(diagnostics.parseError)}` : ""}${data.loadError ? ` | Load warning: ${escapeHtml(data.loadError)}` : ""}</span></div></td></tr>`;

  if (filteredInventory.length <= pageSize) {
    pagination.innerHTML = "";
  } else {
    const pageWindow = 2;
    const visiblePages = new Set([1, totalPages]);
    for (let page = currentPage - pageWindow; page <= currentPage + pageWindow; page += 1) {
      if (page >= 1 && page <= totalPages) {
        visiblePages.add(page);
      }
    }

    const sortedPages = Array.from(visiblePages).sort((a, b) => a - b);
    const pageButtons = [];
    let lastPage = 0;

    sortedPages.forEach((page) => {
      if (lastPage && page - lastPage > 1) {
        pageButtons.push(`<span class="pagination-ellipsis" aria-hidden="true">...</span>`);
      }

      pageButtons.push(`<button class="pagination-button ${page === currentPage ? "is-active" : ""}" type="button" data-page="${page}">${page}</button>`);
      lastPage = page;
    });

    pagination.innerHTML = `
      <div class="pagination-meta">Page ${currentPage} of ${totalPages}</div>
      <div class="pagination-controls">
        <button class="pagination-button" type="button" data-page="1" ${currentPage === 1 ? "disabled" : ""}>First</button>
        <button class="pagination-button" type="button" data-page-nav="prev" ${currentPage === 1 ? "disabled" : ""}>Previous</button>
        ${pageButtons.join("")}
        <button class="pagination-button" type="button" data-page-nav="next" ${currentPage === totalPages ? "disabled" : ""}>Next</button>
        <button class="pagination-button" type="button" data-page="${totalPages}" ${currentPage === totalPages ? "disabled" : ""}>Last</button>
      </div>
    `;

    pagination.querySelectorAll("[data-page]").forEach((button) => {
      button.addEventListener("click", () => {
        localStorage.setItem(pageKey, button.dataset.page);
        renderInventoryPage();
      });
    });

    pagination.querySelectorAll("[data-page-nav]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextPage = button.dataset.pageNav === "prev" ? currentPage - 1 : currentPage + 1;
        localStorage.setItem(pageKey, String(nextPage));
        renderInventoryPage();
      });
    });
  }

  if (searchInput && !searchInput.dataset.bound) {
    searchInput.addEventListener("input", () => {
      localStorage.setItem(searchKey, searchInput.value);
      localStorage.setItem(pageKey, "1");
      renderInventoryPage();
    });
    searchInput.dataset.bound = "true";
  }

  [
    [brandFilter, brandKey],
    [modelFilter, modelKey]
  ].forEach(([filter, key]) => {
    if (!filter || filter.dataset.bound) return;
    filter.addEventListener("change", () => {
      localStorage.setItem(key, filter.value);
      localStorage.setItem(pageKey, "1");
      renderInventoryPage();
    });
    filter.dataset.bound = "true";
  });

  if (conditionFilter && !conditionFilter.dataset.bound) {
    conditionFilter.addEventListener("change", () => {
      localStorage.setItem(conditionKey, conditionFilter.value);
      localStorage.setItem(pageKey, "1");
      renderInventoryPage();
    });
    conditionFilter.dataset.bound = "true";
  }

  if (pageSizeSelect && !pageSizeSelect.dataset.bound) {
    pageSizeSelect.addEventListener("change", () => {
      localStorage.setItem(pageSizeKey, pageSizeSelect.value);
      localStorage.setItem(pageKey, "1");
      renderInventoryPage();
    });
    pageSizeSelect.dataset.bound = "true";
  }

  if (clearFiltersButton && !clearFiltersButton.dataset.bound) {
    clearFiltersButton.addEventListener("click", () => {
      [searchKey, "ims-inventory-filter", brandKey, modelKey, conditionKey].forEach((key) => localStorage.removeItem(key));
      if (searchInput) searchInput.value = "";
      [brandFilter, modelFilter, conditionFilter].forEach((filter) => {
        if (filter) filter.value = "all";
      });
      localStorage.setItem(pageKey, "1");
      renderInventoryPage();
    });
    clearFiltersButton.dataset.bound = "true";
  }

}

function renderActivityHistoryPage() {
  const data = loadData();
  const activityTableBody = document.querySelector("#activity-history-table-body");
  const activitySummary = document.querySelector("#activity-history-summary");
  const activityPagination = document.querySelector("#activity-history-pagination");
  const typeFilter = document.querySelector("#activity-type-filter");
  const actorFilter = document.querySelector("#activity-actor-filter");
  const dateFromFilter = document.querySelector("#activity-date-from-filter");
  const dateToFilter = document.querySelector("#activity-date-to-filter");
  const pageSizeSelect = document.querySelector("#activity-page-size");
  const clearFiltersButton = document.querySelector("#activity-clear-filters");
  if (!activityTableBody || !activitySummary || !activityPagination || !typeFilter || !actorFilter || !dateFromFilter || !dateToFilter || !pageSizeSelect) return;

  const pageKey = "ims-activity-page";
  const pageSizeKey = "ims-activity-page-size";
  const selectedPageSize = Number(localStorage.getItem(pageSizeKey) ?? pageSizeSelect.value ?? String(INVENTORY_PAGE_SIZE));
  const pageSize = [8, 20, 50, 100].includes(selectedPageSize) ? selectedPageSize : INVENTORY_PAGE_SIZE;
  const dateFromKey = "ims-activity-date-from-filter";
  const dateToKey = "ims-activity-date-to-filter";
  localStorage.removeItem("ims-activity-type-filter");
  localStorage.removeItem("ims-activity-actor-filter");
  const allEvents = getActivityEvents(data);
  const actors = Array.from(new Set(allEvents.map((event) => event.actor).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const selectedType = typeFilter.value || "all";
  const selectedActor = actorFilter.value || "all";
  const selectedDateFrom = dateFromFilter.value || localStorage.getItem(dateFromKey) || "";
  const selectedDateTo = dateToFilter.value || localStorage.getItem(dateToKey) || "";

  if (typeFilter.value !== selectedType) {
    typeFilter.value = selectedType;
  }
  if (dateFromFilter.value !== selectedDateFrom) {
    dateFromFilter.value = selectedDateFrom;
  }
  if (dateToFilter.value !== selectedDateTo) {
    dateToFilter.value = selectedDateTo;
  }
  dateFromFilter.max = selectedDateTo;
  dateToFilter.min = selectedDateFrom;
  if (String(pageSizeSelect.value) !== String(pageSize)) {
    pageSizeSelect.value = String(pageSize);
  }

  actorFilter.innerHTML = `
    <option value="all">All users</option>
    ${actors.map((actor) => `<option value="${escapeHtml(actor)}">${escapeHtml(actor)}</option>`).join("")}
  `;

  if (Array.from(actorFilter.options).some((option) => option.value === selectedActor)) {
    actorFilter.value = selectedActor;
  } else {
    actorFilter.value = "all";
  }

  enhanceFilterSelects(document);

  const filterEvents = (dateFrom, dateTo) => allEvents.filter((event) => {
    const eventDate = new Date(event.createdAt);
    const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
    if (selectedType !== "all" && event.type !== selectedType) return false;
    if (actorFilter.value !== "all" && event.actor !== actorFilter.value) return false;
    if (Number.isNaN(eventDate.getTime())) return !fromDate && !toDate;
    if (fromDate && eventDate < fromDate) return false;
    if (toDate && eventDate > toDate) return false;
    return true;
  });

  let filteredEvents = filterEvents(selectedDateFrom, selectedDateTo);

  const hasActiveActivityFilters = selectedType !== "all"
    || actorFilter.value !== "all"
    || Boolean(dateFromFilter.value || dateToFilter.value);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const currentPage = Math.min(Math.max(Number(localStorage.getItem(pageKey) || "1"), 1), totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageEvents = filteredEvents.slice(startIndex, endIndex);

  activitySummary.textContent = filteredEvents.length
    ? `Showing ${startIndex + 1}-${Math.min(endIndex, filteredEvents.length)} of ${filteredEvents.length}${hasActiveActivityFilters ? " matching" : ""} accountability events`
    : hasActiveActivityFilters
      ? "No activity matched the selected filters. Clear filters to show all activity."
      : "No activity has been recorded yet";

  activityTableBody.innerHTML = filteredEvents.length
    ? pageEvents.map((event) => `
        <tr>
          <td>
            ${renderActivityDateTime(event.createdAt)}
          </td>
          <td><span class="activity-tag activity-tag-${event.type}">${escapeHtml(event.title)}</span></td>
          <td>
            <div class="activity-item-list">
              ${event.itemLines.slice(0, 2).map((itemLine) => `<span class="activity-item-chip">${escapeHtml(itemLine)}</span>`).join("")}
              ${event.itemLines.length > 2 ? `<span class="activity-item-more">+${event.itemLines.length - 2} more item${event.itemLines.length - 2 === 1 ? "" : "s"}</span>` : ""}
            </div>
          </td>
          <td>${escapeHtml(event.quantityText)}</td>
          <td>${escapeHtml(event.actor)}</td>
          <td>
            <div class="activity-detail-cell">
              ${event.detailRows
                ? `<div class="activity-detail-lines">
                    ${event.detailRows.map((row) => `
                      <div class="activity-detail-line">
                        <span>${escapeHtml(row.label)}</span>
                        <strong class="activity-detail-preview-value">${escapeHtml(row.value)}</strong>
                      </div>
                    `).join("")}
                  </div>`
                : event.detailHtml ?? `<span>${escapeHtml(event.detail)}</span>`}
              <a class="button-link" href="activity-detail.html?type=${encodeURIComponent(event.type)}&id=${encodeURIComponent(event.sourceId)}">View Details</a>
            </div>
          </td>
          <td>
            <div class="activity-table-actions">
              ${event.actions.length
                ? event.actions.map((action) => action.kind === "view-handover"
                  ? `<a class="button-link" href="handover.html?id=${encodeURIComponent(action.stockOutId)}" target="_blank" rel="noopener">${escapeHtml(action.label)}</a>`
                  : `<button class="button-link" type="button" data-download-handover="${escapeHtml(action.stockOutId)}">${escapeHtml(action.label)}</button>`
                ).join("")
                : `<span class="activity-no-form">No form</span>`}
            </div>
          </td>
        </tr>
      `).join("")
    : `<tr><td colspan="7"><div class="empty-state">${
        hasActiveActivityFilters
          ? "No stock creation, stock-in, stock-out, or relocation activity matched the selected filters."
          : "No stock creation, stock-in, stock-out, or relocation activity has been recorded yet."
      }</div></td></tr>`;

  if (filteredEvents.length <= pageSize) {
    activityPagination.innerHTML = "";
  } else {
    const pageWindow = 2;
    const visiblePages = new Set([1, totalPages]);
    for (let page = currentPage - pageWindow; page <= currentPage + pageWindow; page += 1) {
      if (page >= 1 && page <= totalPages) {
        visiblePages.add(page);
      }
    }

    const sortedPages = Array.from(visiblePages).sort((a, b) => a - b);
    const pageButtons = [];
    let lastPage = 0;

    sortedPages.forEach((page) => {
      if (lastPage && page - lastPage > 1) {
        pageButtons.push(`<span class="pagination-ellipsis" aria-hidden="true">...</span>`);
      }

      pageButtons.push(`<button class="pagination-button ${page === currentPage ? "is-active" : ""}" type="button" data-activity-page="${page}">${page}</button>`);
      lastPage = page;
    });

    activityPagination.innerHTML = `
      <div class="pagination-meta">Page ${currentPage} of ${totalPages}</div>
      <div class="pagination-controls">
        <button class="pagination-button" type="button" data-activity-page="1" ${currentPage === 1 ? "disabled" : ""}>First</button>
        <button class="pagination-button" type="button" data-activity-page-nav="prev" ${currentPage === 1 ? "disabled" : ""}>Previous</button>
        ${pageButtons.join("")}
        <button class="pagination-button" type="button" data-activity-page-nav="next" ${currentPage === totalPages ? "disabled" : ""}>Next</button>
        <button class="pagination-button" type="button" data-activity-page="${totalPages}" ${currentPage === totalPages ? "disabled" : ""}>Last</button>
      </div>
    `;

    activityPagination.querySelectorAll("[data-activity-page]").forEach((button) => {
      button.addEventListener("click", () => {
        localStorage.setItem(pageKey, button.dataset.activityPage);
        renderActivityHistoryPage();
      });
    });

    activityPagination.querySelectorAll("[data-activity-page-nav]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextPage = button.dataset.activityPageNav === "prev" ? currentPage - 1 : currentPage + 1;
        localStorage.setItem(pageKey, String(nextPage));
        renderActivityHistoryPage();
      });
    });
  }

  activityTableBody.querySelectorAll("[data-download-handover]").forEach((button) => {
    if (button.dataset.bound) return;
    button.addEventListener("click", () => downloadHandoverFile(button.dataset.downloadHandover));
    button.dataset.bound = "true";
  });

  if (!typeFilter.dataset.bound) {
    typeFilter.addEventListener("change", () => {
      localStorage.setItem(pageKey, "1");
      renderActivityHistoryPage();
    });
    typeFilter.dataset.bound = "true";
  }

  if (!actorFilter.dataset.bound) {
    actorFilter.addEventListener("change", () => {
      localStorage.setItem(pageKey, "1");
      renderActivityHistoryPage();
    });
    actorFilter.dataset.bound = "true";
  }

  [
    [dateFromFilter, dateFromKey],
    [dateToFilter, dateToKey]
  ].forEach(([filter, key]) => {
    if (filter.dataset.bound) return;
    filter.addEventListener("change", () => {
      if (filter.value) {
        localStorage.setItem(key, filter.value);
      } else {
        localStorage.removeItem(key);
      }
      localStorage.setItem(pageKey, "1");
      renderActivityHistoryPage();
    });
    filter.dataset.bound = "true";
  });

  if (clearFiltersButton && !clearFiltersButton.dataset.bound) {
    clearFiltersButton.addEventListener("click", () => {
      [dateFromKey, dateToKey].forEach((key) => localStorage.removeItem(key));
      localStorage.setItem(pageKey, "1");
      typeFilter.value = "all";
      actorFilter.value = "all";
      dateFromFilter.value = "";
      dateToFilter.value = "";
      renderActivityHistoryPage();
    });
    clearFiltersButton.dataset.bound = "true";
  }

  if (pageSizeSelect && !pageSizeSelect.dataset.bound) {
    pageSizeSelect.addEventListener("change", () => {
      localStorage.setItem(pageSizeKey, pageSizeSelect.value);
      localStorage.setItem(pageKey, "1");
      renderActivityHistoryPage();
    });
    pageSizeSelect.dataset.bound = "true";
  }
}

function initCreateStockPage() {
  const content = document.querySelector(".main-shell");
  const inventoryForm = document.querySelector("#inventory-form");
  const modelSelect = document.querySelector("#create-model-select");
  const newCategoryField = document.querySelector("#create-new-model-field");
  const newCategoryInput = document.querySelector("#create-model-new");
  if (!content || !inventoryForm || !modelSelect || !newCategoryField || !newCategoryInput) return;

  const newCategoryValue = "__new_category__";
  const getCategories = () => getUniqueInventoryValues(loadData().inventory, "model");
  const renderCategoryOptions = (selectedValue = "") => {
    const categories = getCategories();
    const canRestoreSelectedValue = selectedValue && (selectedValue === newCategoryValue || categories.includes(selectedValue));
    const safeSelectedValue = canRestoreSelectedValue ? selectedValue : "";
    modelSelect.innerHTML = [
      `<option value="" disabled ${safeSelectedValue ? "" : "selected"}>Select a category</option>`,
      ...categories.map((category) => `<option value="${escapeHtml(category)}" ${category === safeSelectedValue ? "selected" : ""}>${escapeHtml(category)}</option>`),
      `<option value="${newCategoryValue}" ${safeSelectedValue === newCategoryValue ? "selected" : ""}>Category not listed</option>`
    ].join("");
    if (safeSelectedValue) {
      modelSelect.value = safeSelectedValue;
    }
    syncCustomSelect(modelSelect);
  };
  const updateNewCategoryState = () => {
    const isAddingNewCategory = modelSelect.value === newCategoryValue;
    newCategoryField.hidden = !isAddingNewCategory;
    newCategoryInput.required = isAddingNewCategory;
    newCategoryInput.disabled = !isAddingNewCategory;
    if (!isAddingNewCategory) newCategoryInput.value = "";
  };
  const resolveCategoryValue = () => {
    const categories = getCategories();
    if (modelSelect.value !== newCategoryValue) return modelSelect.value.trim();

    const requestedCategory = newCategoryInput.value.trim().replace(/\s+/g, " ");
    const existingCategory = categories.find((category) => category.toLowerCase() === requestedCategory.toLowerCase());
    return existingCategory ?? requestedCategory;
  };

  renderCategoryOptions();
  updateNewCategoryState();
  enhanceFilterSelects(inventoryForm);

  if (!inventoryForm.dataset.bound) {
    modelSelect.addEventListener("change", updateNewCategoryState);

    inventoryForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(inventoryForm);
      const currentUser = getCurrentUser();
      const model = resolveCategoryValue();
      if (!model) {
        showNotice(content, "Choose an existing category or enter a new category before saving.");
        return;
      }
      const ownQuantity = Math.max(Math.floor(Number(form.get("ownQuantity") ?? 0)), 0);
      const consignmentQuantity = Math.max(Math.floor(Number(form.get("consignmentQuantity") ?? 0)), 0);
      if (!Number.isFinite(ownQuantity) || !Number.isFinite(consignmentQuantity)) {
        showNotice(content, "Enter valid LC Stock and consignment quantities before saving.");
        return;
      }
      const quantity = ownQuantity + consignmentQuantity;
      const pendingItem = {
        brand: String(form.get("brand") ?? "").trim(),
        model,
        name: String(form.get("name") ?? "").trim(),
        sku: String(form.get("sku") ?? "").trim(),
        unit: String(form.get("unit") ?? "").trim(),
        quantity,
        ownQuantity,
        consignmentQuantity,
        stockCondition: normalizeStockCondition(form.get("stockCondition")),
        location: String(form.get("location") ?? "").trim()
      };

      const confirmed = await showCreateStockConfirmationDialog(pendingItem);
      if (!confirmed) return;

      try {
        await sendBackendAction("create-stock", pendingItem);
      } catch (error) {
        showNotice(content, error.message || "The stock could not be saved to the backend.");
        return;
      }
      inventoryForm.reset();
      renderCategoryOptions("");
      updateNewCategoryState();
      resetInventoryViewState();
      showToast(`Inventory item added successfully by ${getUserDisplayName(currentUser)}.`);
    });
    inventoryForm.dataset.bound = "true";
  }
}

function initRelocateStockPage() {
  const content = document.querySelector(".main-shell");
  const form = document.querySelector("#relocate-form");
  const itemSelect = document.querySelector("#relocate-item");
  const currentLocationDisplay = document.querySelector("#relocate-current-location");
  const newLocationInput = document.querySelector("#relocate-new-location");
  const remarksInput = document.querySelector("#relocate-remarks");
  const relocateStockPicker = document.querySelector("[data-relocate-stock-picker]");
  const relocateStockPickerButton = document.querySelector("#relocate-stock-picker-button");
  const relocateStockPickerPopover = document.querySelector("#relocate-stock-picker-popover");
  const relocateStockPickerSearch = document.querySelector("#relocate-stock-picker-search");
  const relocateStockPickerList = document.querySelector("#relocate-stock-picker-list");
  if (!content || !form || !itemSelect || !currentLocationDisplay || !newLocationInput || !remarksInput) return;

  const renderOptions = (selectedId = "") => {
    const inventory = loadData().inventory
      .slice()
      .sort((a, b) => String(a.model ?? "").localeCompare(String(b.model ?? "")) || String(a.name ?? "").localeCompare(String(b.name ?? "")));
    itemSelect.innerHTML = [
      `<option value="" disabled ${selectedId ? "" : "selected"}>Select an item</option>`,
      ...inventory.map((item) => `
        <option value="${escapeHtml(item.id)}" ${item.id === selectedId ? "selected" : ""}>
          ${escapeHtml(item.name ?? "-")} | ${escapeHtml(item.sku ?? "-")} | ${escapeHtml(item.location ?? "Main Store")}
        </option>
      `)
    ].join("");
    if (selectedId) itemSelect.value = selectedId;
  };

  const getSelectedItem = () => {
    const data = loadData();
    return data.inventory.find((item) => item.id === itemSelect.value) ?? null;
  };

  const updateCurrentLocation = () => {
    const item = getSelectedItem();
    currentLocationDisplay.value = item?.location ?? "";
    currentLocationDisplay.placeholder = item ? "" : "Select an item first";
  };

  renderOptions();
  updateCurrentLocation();
  const initialData = loadData();
  renderStockPickerList(relocateStockPickerList, initialData.inventory, itemSelect.value, relocateStockPickerSearch?.value ?? "", {
    onlyInStock: false,
    emptyMessage: "No inventory items match your search."
  });
  updateStockPickerButton(relocateStockPickerButton, getSelectedItem(), { quantityLabel: "current" });

  if (!form.dataset.bound) {
    const setRelocateStockPickerOpen = (open) => {
      if (!relocateStockPickerPopover || !relocateStockPickerButton) return;
      relocateStockPickerPopover.hidden = !open;
      relocateStockPickerButton.setAttribute("aria-expanded", String(open));
      if (open) {
        const currentData = loadData();
        renderStockPickerList(relocateStockPickerList, currentData.inventory, itemSelect.value, relocateStockPickerSearch?.value ?? "", {
          onlyInStock: false,
          emptyMessage: "No inventory items match your search."
        });
        requestAnimationFrame(() => relocateStockPickerSearch?.focus());
      }
    };

    const selectRelocateItem = (selectedItem) => {
      if (!selectedItem) return;
      itemSelect.value = selectedItem.id;
      updateCurrentLocation();
      updateStockPickerButton(relocateStockPickerButton, selectedItem, { quantityLabel: "current" });
      renderStockPickerList(relocateStockPickerList, loadData().inventory, selectedItem.id, relocateStockPickerSearch?.value ?? "", {
        onlyInStock: false,
        emptyMessage: "No inventory items match your search."
      });
    };

    relocateStockPickerButton?.addEventListener("click", () => {
      setRelocateStockPickerOpen(relocateStockPickerPopover?.hidden ?? true);
    });

    relocateStockPickerSearch?.addEventListener("input", () => {
      const currentData = loadData();
      renderStockPickerList(relocateStockPickerList, currentData.inventory, itemSelect.value, relocateStockPickerSearch.value, {
        onlyInStock: false,
        emptyMessage: "No inventory items match your search."
      });
    });

    relocateStockPickerList?.addEventListener("click", (event) => {
      const option = event.target.closest("[data-stock-picker-option]");
      if (!option) return;
      const currentData = loadData();
      const selectedItem = currentData.inventory.find((item) => item.id === option.dataset.stockPickerOption);
      selectRelocateItem(selectedItem);
      setRelocateStockPickerOpen(false);
    });

    document.addEventListener("click", (event) => {
      if (!relocateStockPicker || relocateStockPicker.contains(event.target)) return;
      setRelocateStockPickerOpen(false);
    });

    relocateStockPickerSearch?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setRelocateStockPickerOpen(false);
        relocateStockPickerButton?.focus();
      }
    });

    itemSelect.addEventListener("change", () => {
      updateCurrentLocation();
      updateStockPickerButton(relocateStockPickerButton, getSelectedItem(), { quantityLabel: "current" });
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const nextData = loadData();
      const item = nextData.inventory.find((entry) => entry.id === itemSelect.value);
      if (!item) {
        showNotice(content, "Select an inventory item before saving the relocation.");
        return;
      }

      const fromLocation = String(item.location ?? "Main Store").trim() || "Main Store";
      const toLocation = newLocationInput.value.trim().replace(/\s+/g, " ");
      const remarks = remarksInput.value.trim().replace(/\s+/g, " ");
      if (!toLocation) {
        showNotice(content, "Enter the new storage location before saving.");
        return;
      }
      if (toLocation.toLowerCase() === fromLocation.toLowerCase()) {
        showNotice(content, "The new location is the same as the current location.");
        return;
      }

      const confirmed = await showRelocateStockConfirmationDialog({
        item,
        fromLocation,
        toLocation,
        remarks
      });
      if (!confirmed) return;

      try {
        await sendBackendAction("relocate-stock", {
          itemId: item.id,
          toLocation,
          remarks
        });
      } catch (error) {
        showNotice(content, error.message || "The relocation could not be saved to the backend.");
        return;
      }

      form.reset();
      renderOptions("");
      updateCurrentLocation();
      updateStockPickerButton(relocateStockPickerButton, null, { quantityLabel: "current" });
      if (relocateStockPickerSearch) relocateStockPickerSearch.value = "";
      renderStockPickerList(relocateStockPickerList, loadData().inventory, "", "", {
        onlyInStock: false,
        emptyMessage: "No inventory items match your search."
      });
      showToast("Stock relocation saved and audit record created.");
    });
    form.dataset.bound = "true";
  }
}

function initAddStockPage() {
  const content = document.querySelector(".main-shell");
  const adjustItemSelect = document.querySelector("#adjust-item");
  const adjustQuantityInput = document.querySelector("#adjust-quantity");
  const adjustStockTypeSelect = document.querySelector("#adjust-stock-type");
  const adjustmentLines = document.querySelector("#adjustment-lines");
  const adjustmentEmpty = document.querySelector("#adjustment-empty");
  const adjustmentSummary = document.querySelector("#adjustment-summary");
  const adjustStockPicker = document.querySelector("[data-adjust-stock-picker]");
  const adjustStockPickerButton = document.querySelector("#adjust-stock-picker-button");
  const adjustStockPickerPopover = document.querySelector("#adjust-stock-picker-popover");
  const adjustStockPickerSearch = document.querySelector("#adjust-stock-picker-search");
  const adjustStockPickerList = document.querySelector("#adjust-stock-picker-list");
  const adjustConsignmentRestockNotice = document.querySelector("#adjust-consignment-restock-notice");
  const addAdjustmentLineButton = document.querySelector("#add-adjustment-line");
  const adjustmentForm = document.querySelector("#adjustment-form");
  if (!content || !adjustItemSelect || !adjustQuantityInput || !adjustStockTypeSelect || !adjustmentLines || !adjustmentEmpty || !adjustmentSummary || !addAdjustmentLineButton || !adjustmentForm) return;

  const refreshAddStockOptions = () => {
    const data = loadData();
    const currentValue = adjustItemSelect.value;
    adjustItemSelect.innerHTML = data.inventory.length
      ? buildAdjustmentOptions(data.inventory)
      : `<option value="">No inventory items available</option>`;

    if (currentValue && Array.from(adjustItemSelect.options).some((option) => option.value === currentValue)) {
      adjustItemSelect.value = currentValue;
    }

    const selectedItem = data.inventory.find((item) => item.id === adjustItemSelect.value);
    renderStockPickerList(adjustStockPickerList, data.inventory, adjustItemSelect.value, adjustStockPickerSearch?.value ?? "", {
      onlyInStock: false,
      emptyMessage: "No inventory items match your search."
    });
    updateStockPickerButton(adjustStockPickerButton, selectedItem, { quantityLabel: "current" });
    updateConsignmentRestockNotice(adjustConsignmentRestockNotice, selectedItem);
    renderAdjustmentIssueList(adjustmentLines, adjustmentEmpty, adjustmentSummary, data.inventory);
  };

  refreshAddStockOptions();

  if (!adjustmentForm.dataset.bound) {
    const setAdjustStockPickerOpen = (open) => {
      if (!adjustStockPickerPopover || !adjustStockPickerButton) return;
      adjustStockPickerPopover.hidden = !open;
      adjustStockPickerButton.setAttribute("aria-expanded", String(open));
      if (open) {
        const currentData = loadData();
        renderStockPickerList(adjustStockPickerList, currentData.inventory, adjustItemSelect.value, adjustStockPickerSearch?.value ?? "", {
          onlyInStock: false,
          emptyMessage: "No inventory items match your search."
        });
        requestAnimationFrame(() => adjustStockPickerSearch?.focus());
      }
    };

    adjustStockPickerButton?.addEventListener("click", () => {
      setAdjustStockPickerOpen(adjustStockPickerPopover?.hidden ?? true);
    });

    adjustStockPickerSearch?.addEventListener("input", () => {
      const currentData = loadData();
      renderStockPickerList(adjustStockPickerList, currentData.inventory, adjustItemSelect.value, adjustStockPickerSearch.value, {
        onlyInStock: false,
        emptyMessage: "No inventory items match your search."
      });
    });

    adjustStockPickerList?.addEventListener("click", (event) => {
      const option = event.target.closest("[data-stock-picker-option]");
      if (!option) return;
      const currentData = loadData();
      const selectedItem = currentData.inventory.find((item) => item.id === option.dataset.stockPickerOption);
      if (!selectedItem) return;
      adjustItemSelect.value = selectedItem.id;
      updateStockPickerButton(adjustStockPickerButton, selectedItem, { quantityLabel: "current" });
      updateConsignmentRestockNotice(adjustConsignmentRestockNotice, selectedItem);
      renderStockPickerList(adjustStockPickerList, currentData.inventory, selectedItem.id, adjustStockPickerSearch?.value ?? "", {
        onlyInStock: false,
        emptyMessage: "No inventory items match your search."
      });
      setAdjustStockPickerOpen(false);
    });

    document.addEventListener("click", (event) => {
      if (!adjustStockPicker || adjustStockPicker.contains(event.target)) return;
      setAdjustStockPickerOpen(false);
    });

    adjustStockPickerSearch?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setAdjustStockPickerOpen(false);
        adjustStockPickerButton?.focus();
      }
    });

    adjustItemSelect.addEventListener("change", () => {
      const currentData = loadData();
      const selectedItem = currentData.inventory.find((item) => item.id === adjustItemSelect.value);
      updateStockPickerButton(adjustStockPickerButton, selectedItem, { quantityLabel: "current" });
      updateConsignmentRestockNotice(adjustConsignmentRestockNotice, selectedItem);
      renderStockPickerList(adjustStockPickerList, currentData.inventory, adjustItemSelect.value, adjustStockPickerSearch?.value ?? "", {
        onlyInStock: false,
        emptyMessage: "No inventory items match your search."
      });
    });

    addAdjustmentLineButton.addEventListener("click", () => {
      const currentData = loadData();
      const itemId = adjustItemSelect.value;
      const quantity = Number(adjustQuantityInput.value || "0");
      const receivingPurpose = ["own", "consignment"].includes(adjustStockTypeSelect.value)
        ? adjustStockTypeSelect.value
        : "own";
      const item = currentData.inventory.find((entry) => entry.id === itemId);

      if (!itemId || !item || quantity <= 0) {
        showNotice(content, "Choose an item and enter a valid quantity before adding it to the stock-in list.");
        return;
      }

      const existingRow = adjustmentLines.querySelector(`[data-item-id="${itemId}"][data-receiving-purpose="${receivingPurpose}"]`);
      if (existingRow) {
        const quantityInput = existingRow.querySelector('input[name="adjustmentQuantity"]');
        quantityInput.value = Number(quantityInput.value || "0") + quantity;
      } else {
        adjustmentLines.insertAdjacentHTML("beforeend", `
          <tr data-adjustment-item-row data-item-id="${item.id}" data-receiving-purpose="${receivingPurpose}">
            <td><strong>${escapeHtml(item.name)}</strong><br><span class="muted">${escapeHtml(item.brand ?? "Generic")} / ${escapeHtml(item.model ?? "Standard")}</span></td>
            <td>${escapeHtml(item.sku)}</td>
            <td data-adjustment-current-stock>${renderStockBreakdownChips(item)}</td>
            <td data-adjustment-allocation>${renderStockInAllocationChips(item, quantity, receivingPurpose)}</td>
            <td><input class="stock-out-qty-input" name="adjustmentQuantity" type="number" min="1" step="1" value="${quantity}"></td>
            <td>${escapeHtml(item.unit ?? "-")}</td>
            <td><button type="button" class="button-link stock-out-line-remove" data-adjustment-remove>Remove</button></td>
          </tr>
        `);
      }

      adjustQuantityInput.value = "1";
      renderAdjustmentIssueList(adjustmentLines, adjustmentEmpty, adjustmentSummary, currentData.inventory);
    });

    adjustmentForm.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-adjustment-remove]");
      if (removeButton) {
        removeButton.closest("[data-adjustment-item-row]")?.remove();
        renderAdjustmentIssueList(adjustmentLines, adjustmentEmpty, adjustmentSummary, loadData().inventory);
      }
    });

    adjustmentForm.addEventListener("input", (event) => {
      if (event.target.matches('input[name="adjustmentQuantity"]')) {
        renderAdjustmentIssueList(adjustmentLines, adjustmentEmpty, adjustmentSummary, loadData().inventory);
      }
    });

    adjustmentForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const nextData = loadData();
      const currentUser = getCurrentUser();
      const lineItems = Array.from(adjustmentForm.querySelectorAll("[data-adjustment-item-row]"))
        .map((line) => ({
          itemId: line.dataset.itemId ?? "",
          receivingPurpose: ["own", "consignment"].includes(line.dataset.receivingPurpose)
            ? line.dataset.receivingPurpose
            : "own",
          quantity: Number(line.querySelector('input[name="adjustmentQuantity"]')?.value ?? "0")
        }))
        .filter((line) => line.itemId && line.quantity > 0);

      if (!lineItems.length) {
        showNotice(content, "Add at least one stock item with a valid quantity.");
        return;
      }

      const confirmationLines = lineItems.map((line) => {
        const item = nextData.inventory.find((record) => record.id === line.itemId);
        return {
          ...line,
          name: item?.name ?? "Unknown item",
          sku: item?.sku ?? "-",
          brand: item?.brand ?? "Generic",
          model: item?.model ?? "Standard"
        };
      });

      const confirmed = await showStockInConfirmationDialog(confirmationLines);

      if (!confirmed) return;

      try {
        await sendBackendAction("add-stock", { lines: lineItems });
      } catch (error) {
        showNotice(content, error.message || "The stock-in transaction could not be saved to the backend.");
        return;
      }
      adjustmentForm.reset();
      adjustmentLines.innerHTML = "";
      refreshAddStockOptions();
      showToast(`Stocks added successfully by ${getUserDisplayName(currentUser)}.`);
    });
    adjustmentForm.dataset.bound = "true";
  }
}

function initDrawStockPage() {
  const content = document.querySelector(".main-shell");
  const stockOutItemSelect = document.querySelector("#stock-out-item");
  const stockOutQuantityInput = document.querySelector("#stock-out-quantity");
  const stockOutSourceSelect = document.querySelector("#stock-out-source") ?? { value: "own" };
  const stockOutLines = document.querySelector("#stock-out-lines");
  const stockOutEmpty = document.querySelector("#stock-out-empty");
  const stockOutSummary = document.querySelector("#stock-out-summary");
  const stockPicker = document.querySelector("[data-stock-picker]");
  const stockPickerButton = document.querySelector("#stock-picker-button");
  const stockPickerPopover = document.querySelector("#stock-picker-popover");
  const stockPickerSearch = document.querySelector("#stock-picker-search");
  const stockPickerList = document.querySelector("#stock-picker-list");
  const receiverInput = document.querySelector("#receiver-input");
  const receiverPickerList = document.querySelector("#receiver-picker-list");
  const addStockOutLineButton = document.querySelector("#add-stock-out-line");
  const stockOutForm = document.querySelector("#stock-out-form");
  if (!content || !stockOutItemSelect || !stockOutQuantityInput || !stockOutLines || !stockOutEmpty || !stockOutSummary || !addStockOutLineButton || !stockOutForm) {
    return;
  }

  const updateStockOutSourceOptions = (item) => {
    if (!stockOutSourceSelect || !("options" in stockOutSourceSelect)) return;
    const ownAvailable = Math.max(Number(item?.ownQuantity ?? item?.quantity ?? 0), 0);
    const consignmentAvailable = Math.max(Number(item?.consignmentQuantity ?? 0), 0);
    const currentValue = stockOutSourceSelect.value === "consignment" ? "consignment" : "own";

    stockOutSourceSelect.innerHTML = `
      <option value="own"${ownAvailable <= 0 ? " disabled" : ""}>LC Stock</option>
      <option value="consignment"${consignmentAvailable <= 0 ? " disabled" : ""}>Consignment</option>
    `;

    if (currentValue === "consignment" && consignmentAvailable > 0) {
      stockOutSourceSelect.value = "consignment";
    } else if (ownAvailable > 0) {
      stockOutSourceSelect.value = "own";
    } else if (consignmentAvailable > 0) {
      stockOutSourceSelect.value = "consignment";
    } else {
      stockOutSourceSelect.value = "own";
    }

    syncCustomSelect(stockOutSourceSelect);
  };

  const refreshDrawStockOptions = () => {
    const data = loadData();
    const currentValue = stockOutItemSelect.value;
    stockOutItemSelect.innerHTML = data.inventory.some((item) => item.quantity > 0)
      ? buildStockOutOptions(data.inventory)
      : `<option value="">No in-stock items available</option>`;

    if (currentValue && Array.from(stockOutItemSelect.options).some((option) => option.value === currentValue)) {
      stockOutItemSelect.value = currentValue;
    }

    const selectedItem = data.inventory.find((item) => item.id === stockOutItemSelect.value);
    renderStockPickerList(stockPickerList, data.inventory, stockOutItemSelect.value, stockPickerSearch?.value ?? "");
    updateStockPickerButton(stockPickerButton, selectedItem);
    updateStockOutSourceOptions(selectedItem);
    renderStockOutIssueList(stockOutLines, stockOutEmpty, stockOutSummary, data.inventory);
  };

  refreshDrawStockOptions();
  enhanceFilterSelects(content);

  const addStockOutLine = () => {
    const currentData = loadData();
    const itemId = stockOutItemSelect.value;
    const quantity = Number(stockOutQuantityInput.value || "0");
    const issueSource = stockOutSourceSelect.value === "consignment" ? "consignment" : "own";
    const item = currentData.inventory.find((entry) => entry.id === itemId);

    if (!itemId || !item || quantity <= 0) {
      showNotice(content, "Choose an item and enter a valid quantity before adding it to the issue list.");
      return;
    }

    const existingRow = stockOutLines.querySelector(`[data-item-id="${itemId}"][data-issue-source="${issueSource}"]`);
    const existingQuantity = existingRow
      ? Number(existingRow.querySelector('input[name="issueQuantity"]')?.value ?? "0")
      : 0;
    const availableForSource = issueSource === "consignment"
      ? Number(item.consignmentQuantity ?? 0)
      : Number(item.ownQuantity ?? item.quantity ?? 0);
    if (existingQuantity + quantity > availableForSource) {
      showNotice(content, `${item.name} only has ${availableForSource} ${issueSource === "consignment" ? "consignment" : "LC Stock"} available.`);
      return;
    }

    if (existingRow) {
      const quantityInput = existingRow.querySelector('input[name="issueQuantity"]');
      quantityInput.value = Number(quantityInput.value || "0") + quantity;
    } else {
      stockOutLines.insertAdjacentHTML("beforeend", `
        <tr data-stock-out-item-row data-item-id="${item.id}" data-issue-source="${issueSource}">
          <td><strong>${escapeHtml(item.name)}</strong><br><span class="muted">${escapeHtml(item.brand ?? "Generic")} / ${escapeHtml(item.model ?? "Standard")}</span></td>
          <td>${escapeHtml(item.sku)}</td>
          <td data-stock-out-available>${renderStockBreakdownChips(item)}</td>
          <td><span class="inline-stock-chip ${issueSource === "consignment" ? "inline-stock-chip-consign" : "inline-stock-chip-own"}">${escapeHtml(formatStockPurposeLabel(issueSource))}</span></td>
          <td>
            <input class="stock-out-qty-input" name="issueQuantity" type="number" min="1" step="1" value="${quantity}">
            <span class="consignment-use-hint" data-stock-out-consignment-notice hidden></span>
          </td>
          <td>${escapeHtml(item.unit ?? "-")}</td>
          <td><button type="button" class="button-link stock-out-line-remove" data-stock-out-remove>Remove</button></td>
        </tr>
      `);
    }

    stockOutQuantityInput.value = "0";
    updateStockOutSourceOptions(item);
    renderStockOutIssueList(stockOutLines, stockOutEmpty, stockOutSummary, currentData.inventory);
  };

  if (!addStockOutLineButton.dataset.bound) {
    addStockOutLineButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      addStockOutLine();
    });
    addStockOutLineButton.dataset.bound = "true";
  }

  if (stockOutForm && !stockOutForm.dataset.bound) {
    const setStockPickerOpen = (open) => {
      if (!stockPickerPopover || !stockPickerButton) return;
      stockPickerPopover.hidden = !open;
      stockPickerButton.setAttribute("aria-expanded", String(open));
      if (open) {
        const currentData = loadData();
        renderStockPickerList(stockPickerList, currentData.inventory, stockOutItemSelect.value, stockPickerSearch?.value ?? "");
        requestAnimationFrame(() => stockPickerSearch?.focus());
      }
    };

    stockPickerButton?.addEventListener("click", () => {
      setStockPickerOpen(stockPickerPopover?.hidden ?? true);
    });

    stockPickerSearch?.addEventListener("input", () => {
      const currentData = loadData();
      renderStockPickerList(stockPickerList, currentData.inventory, stockOutItemSelect.value, stockPickerSearch.value);
    });

    stockPickerList?.addEventListener("click", (event) => {
      const option = event.target.closest("[data-stock-picker-option]");
      if (!option) return;
      const currentData = loadData();
      const selectedItem = currentData.inventory.find((item) => item.id === option.dataset.stockPickerOption);
      if (!selectedItem) return;
      stockOutItemSelect.value = selectedItem.id;
      updateStockPickerButton(stockPickerButton, selectedItem);
      updateStockOutSourceOptions(selectedItem);
      renderStockPickerList(stockPickerList, currentData.inventory, selectedItem.id, stockPickerSearch?.value ?? "");
      setStockPickerOpen(false);
    });

    document.addEventListener("click", (event) => {
      if (!stockPicker || stockPicker.contains(event.target)) return;
      setStockPickerOpen(false);
    });

    stockPickerSearch?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setStockPickerOpen(false);
        stockPickerButton?.focus();
      }
    });

    stockOutItemSelect.addEventListener("change", () => {
      const currentData = loadData();
      const selectedItem = currentData.inventory.find((item) => item.id === stockOutItemSelect.value);
      updateStockPickerButton(stockPickerButton, selectedItem);
      updateStockOutSourceOptions(selectedItem);
      renderStockPickerList(stockPickerList, currentData.inventory, stockOutItemSelect.value, stockPickerSearch?.value ?? "");
    });

    const setReceiverPickerOpen = (open) => {
      if (!receiverInput || !receiverPickerList) return;
      receiverPickerList.hidden = !open;
      receiverInput.setAttribute("aria-expanded", String(open));
    };

    const filterReceiverOptions = () => {
      if (!receiverInput || !receiverPickerList) return;
      const searchTerm = receiverInput.value.trim().toLowerCase();
      let visibleCount = 0;
      receiverPickerList.querySelectorAll("[data-receiver-option]").forEach((option) => {
        const isVisible = !searchTerm || option.dataset.receiverOption.toLowerCase().includes(searchTerm);
        option.hidden = !isVisible;
        if (isVisible) visibleCount += 1;
      });
      receiverPickerList.classList.toggle("is-empty", visibleCount === 0);
    };

    receiverInput?.addEventListener("focus", () => {
      filterReceiverOptions();
      setReceiverPickerOpen(true);
    });

    receiverInput?.addEventListener("input", () => {
      filterReceiverOptions();
      setReceiverPickerOpen(true);
    });

    receiverInput?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setReceiverPickerOpen(false);
      }
    });

    receiverPickerList?.addEventListener("click", (event) => {
      const option = event.target.closest("[data-receiver-option]");
      if (!option || !receiverInput) return;
      receiverInput.value = option.dataset.receiverOption;
      receiverInput.dispatchEvent(new Event("input", { bubbles: true }));
      setReceiverPickerOpen(false);
      receiverInput.focus();
    });

    document.addEventListener("click", (event) => {
      if (event.target.closest(".receiver-picker-field")) return;
      setReceiverPickerOpen(false);
    });

    stockOutForm.addEventListener("click", (event) => {
      if (event.target.closest("#add-stock-out-line")) {
        event.preventDefault();
        addStockOutLine();
        return;
      }
      const removeButton = event.target.closest("[data-stock-out-remove]");
      if (removeButton) {
        removeButton.closest("[data-stock-out-item-row]")?.remove();
        renderStockOutIssueList(stockOutLines, stockOutEmpty, stockOutSummary, loadData().inventory);
      }
    });

    stockOutForm.addEventListener("input", (event) => {
      if (!stockOutLines || !stockOutEmpty || !stockOutSummary) return;
      if (event.target.matches('input[name="issueQuantity"]')) {
        renderStockOutIssueList(stockOutLines, stockOutEmpty, stockOutSummary, loadData().inventory);
      }
    });

    stockOutForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(stockOutForm);
      const nextData = loadData();
      const currentUser = getCurrentUser();
      const lineItems = Array.from(stockOutForm.querySelectorAll("[data-stock-out-item-row]"))
        .map((line) => ({
          itemId: line.dataset.itemId ?? "",
          issueSource: line.dataset.issueSource === "consignment" ? "consignment" : "own",
          quantity: Number(line.querySelector('input[name="issueQuantity"]')?.value ?? "0")
        }))
        .filter((line) => line.itemId && line.quantity > 0);

      if (!lineItems.length) {
        showNotice(content, "Add at least one stock-out item with a valid quantity.");
        return;
      }

      const requestedByItemAndSource = lineItems.reduce((map, line) => {
        const key = `${line.itemId}|${line.issueSource}`;
        map.set(key, (map.get(key) ?? 0) + line.quantity);
        return map;
      }, new Map());

      for (const [key, requestedQty] of requestedByItemAndSource.entries()) {
        const [itemId, issueSource] = key.split("|");
        const item = nextData.inventory.find((record) => record.id === itemId);
        if (!item) {
          showNotice(content, "One of the selected items could not be found.");
          return;
        }
        const availableQuantity = issueSource === "consignment"
          ? Number(item.consignmentQuantity ?? 0)
          : Number(item.ownQuantity ?? item.quantity ?? 0);
        if (requestedQty > availableQuantity) {
          showNotice(content, `${item.name} only has ${availableQuantity} ${issueSource === "consignment" ? "consignment" : "LC Stock"} available.`);
          return;
        }
      }

      const confirmationLines = lineItems.map((line) => {
        const item = nextData.inventory.find((record) => record.id === line.itemId);
        return {
          ...line,
          name: item?.name ?? "Inventory item",
          sku: item?.sku ?? "-",
          brand: item?.brand ?? "Generic",
          model: item?.model ?? "Standard"
        };
      });
      const confirmed = await showStockOutConfirmationDialog(confirmationLines, {
        projectTitle: form.get("projectTitle").trim(),
        receivedBy: form.get("receivedBy").trim()
      });
      if (!confirmed) return;

      let stockOutRecord;
      try {
        const result = await sendBackendAction("draw-stock", {
          projectTitle: form.get("projectTitle").trim(),
          receivedBy: form.get("receivedBy").trim(),
          lines: lineItems
        });
        stockOutRecord = result.stockOutRecord;
      } catch (error) {
        showNotice(content, error.message || "The stock-out transaction could not be saved to the backend.");
        return;
      }

      const totalConsignmentIssued = (stockOutRecord?.items ?? []).reduce((sum, item) => sum + Number(item.consignmentQuantity || 0), 0);
      stockOutForm.reset();
      if (stockOutLines && stockOutEmpty && stockOutSummary) {
        stockOutLines.innerHTML = "";
        renderStockOutIssueList(stockOutLines, stockOutEmpty, stockOutSummary, loadData().inventory);
      }
      refreshDrawStockOptions();
      showToast(`Stock withdrawn by ${getUserDisplayName(currentUser)}. Handover form ${stockOutRecord.documentNo} created.${totalConsignmentIssued ? ` ${totalConsignmentIssued} consignment item(s) must be restocked.` : ""}`);
      window.open(`handover.html?id=${encodeURIComponent(stockOutRecord.id)}`, "_blank", "noopener");
    });
    stockOutForm.dataset.bound = "true";
  }
}

function renderHandoverPage() {
  const params = new URLSearchParams(window.location.search);
  const stockOutId = params.get("id");
  const container = document.querySelector("#handover-print");
  const data = loadData();
  const record = data.stockOuts.find((entry) => entry.id === stockOutId);

  if (!record || !container) {
    container.innerHTML = `<div class="empty-state">The requested handover form could not be found.</div>`;
    return;
  }

  const items = normalizeStockOutItems(record, data.inventory);
  container.innerHTML = `
    <div class="toolbar">
      <button class="button-link" type="button" onclick="window.print()">Print</button>
      <button class="button-link" type="button" id="handover-download">Download</button>
    </div>
    ${buildHandoverDocumentMarkup(record, items)}
  `;

  const downloadButton = document.querySelector("#handover-download");
  if (downloadButton && !downloadButton.dataset.bound) {
    downloadButton.addEventListener("click", () => downloadHandoverFile(stockOutId));
    downloadButton.dataset.bound = "true";
  }
}

function renderActivityDetailPage() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  const id = params.get("id");
  const container = document.querySelector("#activity-detail-shell");
  if (!type || !id || !container) return;

  const data = loadData();
  const record = getActivityDetailRecord(type, id, data);
  if (!record) {
    container.innerHTML = `<div class="empty-state">The requested activity record could not be found.</div>`;
    return;
  }

  container.innerHTML = `
    <section class="panel project-card activity-detail-overview">
      <header>
        <div class="project-meta">
          <p class="eyebrow">Activity Record</p>
          <h3>${escapeHtml(record.title)}</h3>
          <p class="section-copy">${escapeHtml(record.summary)}</p>
        </div>
        <span class="activity-tag activity-tag-${escapeHtml(record.type)}">${escapeHtml(record.type.replace("-", " "))}</span>
      </header>
      <div class="metric-grid activity-detail-metrics">
        <div class="metric-card">
          ${renderActivityDateTime(record.createdAt)}
          <span>Date & Time</span>
        </div>
        <div class="metric-card">
          <strong>${escapeHtml(record.actor)}</strong>
          <span>Recorded By</span>
        </div>
        <div class="metric-card">
          <strong>${record.itemRows.length}</strong>
          <span>Line Items</span>
        </div>
      </div>
    </section>

    <section class="panel project-card activity-detail-info">
      <div class="panel-header panel-header-tight">
        <div>
          <p class="eyebrow">Record Details</p>
          <h3>Transaction information</h3>
        </div>
        <div class="card-actions">
          <a class="button-link" href="activity-history.html">Back to History</a>
          ${record.handoverId ? `<a class="button-link" href="handover.html?id=${encodeURIComponent(record.handoverId)}" target="_blank" rel="noopener">View Handover Form</a>` : ""}
        </div>
      </div>
      <div class="metric-grid activity-detail-metrics">
        ${record.detailRows.map((row) => renderActivityDetailMetricCard(row)).join("")}
      </div>
    </section>

    ${renderActivityDetailItemsSection(record)}
    ${record.balanceRows?.length ? `
      <section class="panel project-card activity-detail-balance">
        <div class="panel-header panel-header-tight">
          <div>
            <p class="eyebrow">Balance Movement</p>
            <h3>Previous and updated stock balance</h3>
            <p class="section-copy">Review the stock position before and after this transaction. Older records may use reconstructed balance snapshots.</p>
          </div>
        </div>
        <div class="stock-balance-audit-list">
          ${record.balanceRows.map((row) => `
            <div class="stock-balance-audit-row">
              <div class="stock-balance-audit-item">
                <strong>${escapeHtml(row.name)}</strong>
                <span>${escapeHtml(row.sku)}</span>
              </div>
              ${renderBalanceAuditState(row.balanceBefore, "Previous Stock")}
              <div class="stock-balance-audit-arrow" aria-hidden="true">&rarr;</div>
              ${renderBalanceAuditState(row.balanceAfter, "Stock After")}
              ${renderBalanceDelta(row.balanceBefore, row.balanceAfter)}
            </div>
          `).join("")}
        </div>
      </section>
    ` : ""}
    ${renderCorrectionSection(record)}
    ${renderActivityAuditTrailSection(record, data, type, id)}
  `;

  const correctionForm = container.querySelector("#correction-form");
  if (correctionForm && !correctionForm.dataset.bound) {
    const correctionGate = container.querySelector(".correction-gate");
    const startCorrectionButton = container.querySelector("[data-start-correction]");
    const cancelCorrectionButton = container.querySelector("[data-cancel-correction]");

    startCorrectionButton?.addEventListener("click", () => {
      correctionForm.hidden = false;
      if (correctionGate) correctionGate.hidden = true;
      correctionForm.querySelector("input, select, textarea")?.focus();
    });

    cancelCorrectionButton?.addEventListener("click", () => {
      correctionForm.reset();
      correctionForm.hidden = true;
      if (correctionGate) correctionGate.hidden = false;
      startCorrectionButton?.focus();
    });

    correctionForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const confirmed = await showCorrectionConfirmationDialog(record, correctionForm);
      if (!confirmed) return;
      const result = await applyActivityCorrection(type, id, correctionForm);
      if (!result.ok) {
        showNotice(correctionForm, result.message);
        return;
      }
      queueToast("Correction saved and audit record created.");
      window.location.href = `activity-detail.html?type=correction&id=${encodeURIComponent(result.correctionId)}`;
    });
    correctionForm.dataset.bound = "true";
  }

}

function resetPageScroll() {
  const jumpToTop = () => window.scrollTo(0, 0);
  jumpToTop();
  requestAnimationFrame(jumpToTop);
  setTimeout(jumpToTop, 0);
  setTimeout(jumpToTop, 120);
}

document.addEventListener("DOMContentLoaded", async () => {
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
  resetPageScroll();
  const currentUser = await ensureAuthenticatedSession();
  if (PROTECTED_PAGES.has(document.body.dataset.page) && !currentUser) {
    return;
  }
  initLoginPage(currentUser);
  initHomePage(currentUser);
  initAuthChrome(currentUser);
  applyRoleNavigation(currentUser);
  showQueuedToast();
  if (currentUser) {
    await initializeBackendData();
  }
  if (["inventory", "activity-history", "activity-detail", "add-stock", "draw-stock", "relocate-stock"].includes(document.body.dataset.page)) {
    initSidebar();
  }
  initSectionNavigation();
  const modalController = initModals();
  initCollapsibles();
  initCustomSelectDismissal();
  if (document.body.dataset.page === "inventory") {
    renderInventoryPage();
  }
  if (document.body.dataset.page === "activity-history") {
    renderActivityHistoryPage();
  }
  if (document.body.dataset.page === "activity-detail") {
    renderActivityDetailPage();
  }
  if (document.body.dataset.page === "add-stock") {
    initAddStockPage();
  }
  if (document.body.dataset.page === "draw-stock") {
    initDrawStockPage();
  }
  if (document.body.dataset.page === "relocate-stock") {
    initRelocateStockPage();
  }
  if (document.body.dataset.page === "create-stock") {
    initCreateStockPage();
  }
  if (document.body.dataset.page === "handover") {
    renderHandoverPage();
  }
  window.imsCloseModal = modalController.closeModal;
});

window.addEventListener("load", resetPageScroll);
window.addEventListener("pageshow", resetPageScroll);
