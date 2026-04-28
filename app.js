const STORAGE_KEY = "ims-company-data-v2";
const INVENTORY_PAGE_SIZE = 8;
const USER_STORAGE_KEY = "ims-users-v4";
const SESSION_STORAGE_KEY = "ims-session-user-id-v2";
const PROTECTED_PAGES = new Set(["home", "inventory", "activity-history", "activity-detail", "add-stock", "draw-stock", "create-stock", "handover"]);
const DEFAULT_CONSIGNMENT_BY_SKU = {
  "BOOTH CLEAR": 5
};

const defaultUsers = [
  {
    id: "user-fenny",
    username: "fenny",
    password: "1234",
    name: "Fenny",
    role: "Admin"
  },
  {
    id: "user-albert",
    username: "albert",
    password: "1234",
    name: "Albert",
    role: "Admin"
  },
  {
    id: "user-zin",
    username: "zin",
    password: "1234",
    name: "Zin",
    role: "Engineer"
  },
  {
    id: "user-irvyn",
    username: "irvyn",
    password: "1234",
    name: "Irvyn",
    role: "Engineer"
  },
  {
    id: "user-johnson",
    username: "johnson",
    password: "1234",
    name: "Johnson",
    role: "Administrative"
  },
  {
    id: "user-cindy",
    username: "cindy",
    password: "1234",
    name: "Cindy",
    role: "Administrative"
  }
];

const defaultInventorySeed = [
  ["Actel", "Boot", "UTP RJ45 RUBBER BOOT (FOR CAT6A UTP CABLE) WHITE", "FTP RJ45 WHITE", "PCS", 69, "S1_R2"],
  ["INFINITE", "Boot", "FTP CAT5E CONNECTOR SHIELDED C/W RUBBER BOOT BLACK COLOUR", "IN64491", "PCS", 2000, "I_RACK 1"],
  ["OEM", "Boot", "RJ45 CLEAR BOOT 6MM OPENING (CAT6/TRANSPARENT)", "BT-C60D", "PCS", 920, "S1_R2"],
  ["OEM", "Boot", "RJ45 BOOT CLEAR CAT6 (HOLE OPENING 6MM)", "BOOTH CLEAR", "PCS", 9, "S1_R2"],
  ["OEM", "Boot", "RJ45 BOOT BLUE COLOUR CAT6A (HOLE OPENING 7MM)", "BOOTH BLUE", "PCS", 1425, "S1_R2"],
  ["INFINITE", "Plug", "RJ45 SHIELD CAT6A PLUG", "IN64491", "PCS", 123, "S1_R2"],
  ["Nexans", "Plug", "Field Terminable Plug Category 6A", "N490.001", "PCS", 2, "S1_R2"],
  ["OEM", "Plug", "CAT6 UTP MODULAR PLUG (50U)", "MP-UC6-501", "PCS", 760, "S1_R2"],
  ["OEM", "Plug", "STP CAT6A PLUG", "STP CAT6A PLUG", "PCS", 3744, "S1_R2"],
  ["ALANTEK", "Jack", "CAT 6 UNSHIELDED 180DEG QUICK CRIMP KEYSTONE JACK, WHITE", "302-2QX618-WHAB", "PCS", 7, "S1_R2"],
  ["Commscope", "Jack", "JCK, SL110, RJ45, CAT6, BLK SL SERIES RJ45 JACK, CAT6", "AMP_1375055-2", "PC", 23, "S1_R2"],
  ["Commscope", "Jack", "SL SERIES RJ45 JACK, CAT6 568A/B, LT. ALMOND (WHITE)", "CN1933748-1", "PC", 2, "S1_R2"],
  ["Commscope", "Jack", "JCK: NETCONNECT SLX SERIES MODULAR JACK CAT6A SHIELDED 4 PAIR WITHOUT DUST COVER GREY", "CSP_2153449-4", "PC", 36, "S1_R2"],
  ["Datwyler", "Jack", "Datwyler Keystone Modular KU Cat 6 de-embedded black RJ45 unshielded", "418081", "PCS", 109, "S1_R4"],
  ["Honeywell", "Jack", "Angular RJ45 Jack Adaptor", "RX5456AWHI", "PC", 12, "S1_R2"],
  ["INFINITE", "Jack", "CAT6 KEYSTONE JACK NON SHUTTER WHITE", "IN6-401-WH", "PCS", 350, "S1_R2"],
  ["INFINITE", "Jack", "F/UTP CAT6A JACK (IN6A-431)", "IN6A-431", "PCS", 463, "S1_R2 & S4_R4"],
  ["Nexans", "Jack", "LANmark-6 Evo Snap-In Connector Cat6 Screened", "N420.666", "PCS", 19, "S1_R2"],
  ["Nexans", "Jack", "Evo Snap-In Connector Cat6A 500MHz", "N420.66A", "PCS", 26, "S1_R2"],
  ["Panduit", "Jack", "NETKEY 10GIG 8 POSITION, 8 WIRE PUNCHDOWN JACK MODULE CAT 6A", "NK6X88MBU", "PC", 43, "S1_R2"],
  ["SIEMON", "Jack", "OUTLET, MAX, UTP, CAT6, RJ45, FLT, WHITE P-DWN, T568A/B", "MX6-F02B", "PCS", 8, "S3_R2"],
  ["SIEMON", "Jack", "JCK: SIEMON COPPER OUTLET MAX SHIELDED CAT6A RJ45 HYBRID TOOL-LESS T568A/B BULK PACK WHITE - NEW", "Z6A-S02", "PCS", 24, "S1_R2"],
  ["SIEMON", "Jack", "JCK: Copper Outlet Ultramax UTP Cat6 RJ45 Hybrid Punch Down T568A/5 with Door white", "SIE_U6-H02DS", "PCS", 364, "S1_R2"],
  ["VELCO", "Jack", "VELCO CAT6A SHIELDED RJ45 MODULAR JACK 180C TOOL-LESS METALLIC SILVER", "VCU-6A-MJ-S-SS", "PCS", 8, "S1_R2"],
  ["ALANTEK", "Face Plate", "1-PORT UK STYLE SHUTTERED FACE PLATE, WHITE", "302-203221-SHWH", "PCS", 3, "S1_R2"],
  ["Commscope", "Face Plate", "FACEPLATE KIT DECORATOR 1PORT, BS, WHITE", "CN1859167-1", "PC", 7, "S1_R2"],
  ["Commscope", "Face Plate", "FP: COMMSCOPE 1 PORT ANGLED SHUTTERED FP KIT BBS WHITE (FOR Cat6 & Cat6A)", "CSP_760245679", "PC", 46, "S1_R2"],
  ["Commscope", "Face Plate", "FP KIT CAT 6, BS, 2 PORT, ANGLED SHUTTERED (BLACK) (FOR Cat6 & Cat6A)", "760245680", "PC", 18, "S1_R2"],
  ["Honeywell", "Face Plate", "1G 1M EURO FRONT PLATE", "R5450WHI", "PC", 12, "S1_R2"],
  ["INFINITE", "Face Plate", "FACEPLATE 86 x 86MM 1 PORT", "FP-101-WH", "PCS", 357, "S1_R2 & S3_R4"],
  ["INFINITE", "Face Plate", "FACEPLATE 86 x 86MM 2 PORT", "FP-102-WH", "PCS", 19, "S1_R2"],
  ["INFINITE", "Face Plate", "RJ45 FACEPLATE, SINGLE PORT, ANGLED", "FP-301", "PCS", 145, "S1_R2"],
  ["INFINITE", "Face Plate", "RJ45 FACEPLATE, SINGLE PORT, ANGLED", "FP-301-A", "PCS", 100, "S3_R4"],
  ["INFINITE", "Face Plate", "FACE PLATE 86 x 86MM 2 PORT ANGLED", "FP-302", "PCS", 187, "S1_R2 & S3_R3"],
  ["Nexans", "Face Plate", "UK Angled Wall Outlet Kit 1 Snap-In WH", "N800.511", "PCS", 21, "S1_R2"],
  ["Nexans", "Face Plate", "LANMARK-EU STYLE ANGLED 45 X 45 MODULE 2 SNAP-IN WHITE (NEW) #0700516N", "N800.512", "PCS", 10, "S1_Floor"],
  ["Panduit", "Face Plate", "NETKEY 2-POSITION SINGLE GANG K SLOPED SHUTTERED FACEPLATE KIT", "NKUKS2SAW", "PC", 3, "S1_R2"],
  ["SIEMON", "Face Plate", "FPLT, MAX, BRTSH, SNGL GNG, 1 OPEN, MX WHT", "M-BFP-S-01-02", "PCS", 36, "S1_R2"],
  ["SIEMON", "Face Plate", "FP: FACEPLATE MAX BRITISH SINGLE GANG 2 OPENINGS MX WHITE - NEW", "MX-BFP-S-02-02", "PCS", 15, "S1_R2"],
  ["SIEMON", "Face Plate", "FPLT, DBL LYR, BRTSH, SNGL GNG, 1 OPENS, MX, WHT", "SIE_MX-BFPL-01-02", "PCS", 50, "S1_Floor"],
  ["SIEMON", "Face Plate", "FPLT, DBL LYR, BRTSH, SNGL GNG, 2 OPENS, MX, WHT", "SIE_MX-BFPL-02-02", "PCS", 107, "S1_Floor"],
  ["VELCO", "Face Plate", "VELCO FACE PLACE ANGLE 86x86MM 1PORT WHITE (+ Replacement Screw =20 pcs)", "VCF-FP-BS-AN-WH-1P", "PCS", 4, "S1_R2"],
  ["VELCO", "Face Plate", "VELCO FACE PLACE ANGLE 86x86MM 2PORT WHITE (+ Replacement Screw =20 pcs)", "VCF-FP-BS-AN-WH-2P", "PCS", 5, "S1_R2"],
  ["ALANTEK", "Patch Cord", "CAT 6 UTP 24AWG PATCH CORD, MOLDED BOOT, PVC, 5FT, WHITE", "302-4MU056-FTWH", "PCS", 3, "S1_R3"],
  ["ALANTEK", "Patch Cord", "CAT 6 UTP 24AWG PATCH CORD, MOLDED BOOT, PVC, 7FT, YELLOW", "302-4MU076-FTYL", "PCS", 4, "S1_R3"],
  ["AMP", "Patch Cord", "CAT.6 FTP PATCH CORD WHITE - 3M", "AMP PATCH CORD 3M", "PC", 33, "S1_R4"],
  ["AMP", "Patch Cord", "CAT.6 FTP PATCH CORD WHITE - 5M", "AMP PATCH CORD 5M", "PC", 40, "S1_R4"],
  ["Commscope", "Patch Cord", "CAT6, WHITE, 10 FEET (3M)", "CSP_1-1859250-0", "PC", 6, "S1_R3"],
  ["Commscope", "Patch Cord", "NPC CAT6, UTP, CM, WT, PATCH CORD 3M (Red)", "NPC06UVDB-RD010F", "PC", 26, "S1_R3"],
  ["Commscope", "Patch Cord", "NPC CAT6, UTP, CM, WT, PATCH CORD 3M (White)", "NPC06UVDB-WT010F", "PC", 14, "S1_R4"],
  ["Commscope", "Patch Cord", "PC: NETCONNECT NPC CAT6A S/FTP RJ45 LSZH PATCH CORD WHITE 5.0MT", "CSP_NPC6ASZDB-WT005M", "PC", 5, "S1_R4"],
  ["Commscope", "Patch Cord", "PC: NETCONNECT NPC CAT6A S/FTP RJ45 LSZH PATCH CORD WHITE 3.0MT", "CSP_NPC6ASZDB-WT003M", "PC", 30, "S1_R4"],
  ["Commscope", "Patch Cord", "PC: NETCONNECT NPC CAT6A S/FTP RJ45 LSZH PATCH CORD WHITE 2.0MT", "CSP_NPC6ASZDB-WT002M", "PC", 17, "S1_R4"],
  ["Datwyler", "Patch Cord", "Datwyler patch cord Cat 6A S/FTP FRNC/LSOH orange 3m", "359014", "PCS", 1, "S1_R4"],
  ["Draka", "Patch Cord", "SFTP CAT6A DBOOT PATCH CORD LSHE 26AWG 5M WHITE", "PC8420WH-5", "PCS", 111, "S1_Floor"],
  ["INFINITE", "Patch Cord", "CAT6 UTP PATCH CORD PVC CABLE BLUE 3M", "IN6-303-BL", "PCS", 156, "S1_R3"],
  ["INFINITE", "Patch Cord", "CAT6 UTP PATCH CORD PVC CABLE BLUE 3M", "IN6-303-BL-S", "PCS", 32, "S1_R3"],
  ["INFINITE", "Patch Cord", "CAT6 UTP PATCH CORD PVC CABLE GREY 3M", "IN6-303-GR", "PCS", 6, "S1_R3"],
  ["Nexans", "Patch Cord", "LANMARK6A 10G ULTIM SCREENED CAT6A PATCH CORD LSZH 3M, ORANGE (FOR LAN ROOM)", "N11A.U1F0300K", "PCS", 34, "S1_R3"],
  ["Nexans", "Patch Cord", "LANmark6A 10G Ultim Screened CAT6A Patchcord LSZH 5m, Orange", "N11A.U1F0500K", "PCS", 6, "S1_R3"],
  ["Nexans", "Patch Cord", "LANmark6A 10G Ultim Screened CAT6A Patchcord LSZH 20m, Orange", "N11A.U1F2000K", "PCS", 2, "S1_R3"],
  ["Panduit", "Patch Cord", "Netkey UTP Copper Patch Cord, category 6A, 2m, off white", "NKU6APC2M", "PC", 6, "S1_R3"],
  ["Panduit", "Patch Cord", "CAT6A 26AWG S/FTP SHIELDED PATCH CORD, INTERNATIONAL GRAY, LSZH. 2M", "S6XPC2MIG", "PC", 5, "S3_R3"],
  ["SIEMON", "Patch Cord", "PC-UTP: COPPER PATCH CORD RJ45 CAT6 UTP T568A/B STRANDED CM/LSOH-1 CLEAR BOOT WHITE 2.0 MT - NEW", "SIE_MC6-02M-02-28", "PCS", 316, "S1_R1/R4"],
  ["SIEMON", "Patch Cord", "PC-UTP: COPPER PATCH CORD RJ45 CAT6 UTP T568A/B STRANDED CM/LSOH-1 CLEAR BOOT WHITE 3.0 MT - NEW", "SIE_MC6-03M-02-28", "PCS", 124, "S1_R4"],
  ["VELCO", "Patch Cord", "VELCO CAT6A SHIELDED RJ45 PATCH CORD LSZH ORANGE RAL2003, 2M", "VCU-6A-PC-S-LSF-OR-2M", "PCS", 6, "S1_R3"],
  ["VELCO", "Patch Cord", "VELCO CAT6A SHIELDED RJ45 PATCH CORD LSZH ORANGE RAL2003, 3M", "VCU-6A-PC-S-LSF-OR-3M", "PCS", 17, "S1_R3"],
  ["INFINITE", "Patch Cord Fibre", "LC-SC UPC, SM SIMPLEX PATCHCORD 15M, G657 PVC 2.0MM SHORT BOOT", "INF3311-LUSUV20150", "PCS", 4, "S2_R3"],
  ["INFINITE", "Patch Cord Fibre", "OM4 LSZH LC/UPC-LC/UPC DUPLEX 3M PATCH CORD MULTIMODE", "INF3321-LULUL40030", "PCS", 4, "S2_R3"],
  ["INFINITE", "Patch Cord Fibre", "OM4 LSZH LC/UPC-LC/UPC DUPLEX 5M PATCH CORD MULTIMODE", "INF3321-LULUL40050", "PCS", 89, "S2_R3"],
  ["INFINITE", "Patch Cord Fibre", "OM4 LSZH LC/UPC-LC/UPC DUPLEX 10M PATCH CORD MULTIMODE", "INF3321-LULUL40100", "PCS", 3, "S2_R3"],
  ["INFINITE", "Patch Cord Fibre", "OM4 LSZH LC/UPC-LC/UPC DUPLEX 15M FIBER PATCH CORD", "INF3321-LULUL40150", "PCS", 15, "S2_R3"],
  ["INFINITE", "Patch Cord Fibre", "LU/UPC-LC/UPC, SM, DUPLEX, LSZH FIBER PATCH CORD, 3M", "INF3321-LULULD0030", "PCS", 31, "S2_R3"],
  ["INFINITE", "Patch Cord Fibre", "LC/UPC-LC/UPC, SM, G652D, DUPLEX, LSZH FIBER PATCH CORD, 5M", "INF3321-LULULD0050", "PCS", 1, "S2_R3"],
  ["INFINITE", "Patch Cord Fibre", "LC/UPC-LC/UPC, G652D, DUPLEX, LSZH FIBER PATCH CORD, 15M", "INF3321-LULULD0150", "PCS", 1, "S2_R3"],
  ["INFINITE", "Patch Cord Fibre", "FO PATCH CORD SC/UPC-LC/UPC OM3 50/125UM PLUS CORNING D SIZE 15M", "INF3321-LUSUL40150", "PCS", 2, "S2_R3"],
  ["OEM", "Patch Cord Fibre", "LC-LC/UPC Patch Cord 2.0mm Duplex SM, LSZH, 3M", "LC-LC/UPC 3M", "PCS", 46, "S1_R3"],
  ["OEM", "Patch Cord Fibre", "LC-LC/UPC Patch Cord 2.0mm Duplex SM, LSZH, 5M", "LC-LC/UPC 5M", "PCS", 16, "S1_R3"],
  ["OEM", "Patch Cord Fibre", "LC-LC/UPC Patch Cord 2.0mm Duplex SM, LSZH, 15M", "LC-LC/UPC 15M", "PCS", 31, "S1_R3"],
  ["OEM", "Patch Cord Fibre", "IN6-DX-OM3 3M MULTIMODE", "IN6-DX-OM3_3M", "PCS", 1, "S2_R2"],
  ["OEM", "Patch Cord Fibre", "IN6-DX-OM4 5M MULTIMODE", "IN6-DX-OM4_5M", "PCS", 2, "S2_R2"],
  ["OEM", "Patch Cord Fibre", "LC-LC DX SM 3M SINGLEMODE", "LC-LC DX SM 3M", "PCS", 1, "S2_R2"],
  ["OEM", "Patch Cord Fibre", "LC-LC DX SM 5M SINGLEMODE", "LC-LC DX SM 5M", "PCS", 4, "S2_R2"],
  ["OEM", "Patch Cord Fibre", "LC-SC DX SM 5M SINGLEMODE", "LC-SC DX SM 5M", "PCS", 1, "S2_R2"]
];

function getDefaultConsignmentQuantity(sku) {
  return DEFAULT_CONSIGNMENT_BY_SKU[String(sku ?? "").trim().toUpperCase()] ?? 0;
}

function createSeedInventoryRecord([brand, model, name, sku, unit, quantity, location]) {
  const consignmentQuantity = getDefaultConsignmentQuantity(sku);
  return {
    id: crypto.randomUUID(),
    brand,
    model,
    name,
    sku,
    unit,
    quantity: quantity + consignmentQuantity,
    ownQuantity: quantity,
    consignmentQuantity,
    consignmentBaseline: consignmentQuantity,
    unitCost: 0,
    reorderLevel: 0,
    location,
    createdAt: new Date().toISOString()
  };
}

const defaultData = {
  inventory: defaultInventorySeed.map((item) => createSeedInventoryRecord(item)),
  adjustments: [],
  stockOuts: []
};

function cloneDefaultUsers() {
  return defaultUsers.map((user) => ({ ...user }));
}

function loadUsers() {
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) {
    const seededUsers = cloneDefaultUsers();
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(seededUsers));
    return seededUsers;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) {
      throw new Error("No user records found");
    }

    return parsed.map((user, index) => ({
      id: user.id ?? `user-${index + 1}`,
      username: String(user.username ?? "").trim(),
      password: String(user.password ?? ""),
      name: String(user.name ?? user.username ?? "Unknown User").trim(),
      role: String(user.role ?? "Inventory User").trim()
    }));
  } catch (error) {
    const seededUsers = cloneDefaultUsers();
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(seededUsers));
    return seededUsers;
  }
}

function getCurrentUser() {
  const currentUserId = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!currentUserId) return null;
  return loadUsers().find((user) => user.id === currentUserId) ?? null;
}

function setCurrentUser(userId) {
  localStorage.setItem(SESSION_STORAGE_KEY, userId);
}

function clearCurrentUser() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function getCurrentPagePath() {
  const currentFile = window.location.pathname.split("/").filter(Boolean).pop() || "index.html";
  return `${currentFile}${window.location.search}${window.location.hash}`;
}

function normalizeRole(role) {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "administrator") return "admin";
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
  if (["add-stock", "create-stock"].includes(page)) {
    return role !== "engineer";
  }
  if (page === "draw-stock") {
    return role !== "admin";
  }

  return true;
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

function ensureAuthenticatedSession() {
  const currentUser = getCurrentUser();
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

function normalizeInventoryRecord(item) {
  const createdAt = item.createdAt ?? new Date().toISOString();
  const createdByName = item.createdByName ?? item.createdBy?.name ?? "System Seed";
  const createdByUserId = item.createdByUserId ?? item.createdBy?.userId ?? null;
  const lastUpdatedAt = item.lastUpdatedAt ?? item.updatedAt ?? createdAt;
  const lastUpdatedByName = item.lastUpdatedByName ?? item.updatedByName ?? createdByName;
  const lastUpdatedByUserId = item.lastUpdatedByUserId ?? item.updatedByUserId ?? createdByUserId;
  const defaultConsignment = getDefaultConsignmentQuantity(item.sku);
  const hasConsignmentFields = Object.hasOwn(item, "consignmentQuantity") || Object.hasOwn(item, "consignmentBaseline");
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
  return `Total ${total} | LC Stock ${own} | Consign ${consignment}${restock ? ` (${restock} to restock)` : ""}`;
}

function renderStockBreakdownChips(item) {
  const own = Number(item.ownQuantity ?? item.quantity ?? 0);
  const consignment = Number(item.consignmentQuantity ?? 0);
  const total = Number(item.quantity ?? own + consignment);
  const hasConsignment = consignment > 0 || Number(item.consignmentBaseline ?? 0) > 0;
  if (!hasConsignment) {
    return `<span class="inline-stock-chip inline-stock-chip-own">LC Stock <strong>${own}</strong></span>`;
  }
  return `
    <span class="inline-stock-chip inline-stock-chip-total">Total <strong>${total}</strong></span>
    <span class="inline-stock-chip inline-stock-chip-own">LC Stock <strong>${own}</strong></span>
    <span class="inline-stock-chip inline-stock-chip-consign">Consign <strong>${consignment}</strong></span>
  `;
}

function renderInventoryBalanceCell(item) {
  const total = Number(item.quantity ?? 0);
  const own = Number(item.ownQuantity ?? item.quantity ?? 0);
  const consignment = Number(item.consignmentQuantity ?? 0);
  const hasConsign = consignment > 0 || Number(item.consignmentBaseline ?? 0) > 0;
  return `
    <div class="stock-balance-cell">
      <div class="stock-total">
        <strong>${total}</strong>
        <span>${escapeHtml(item.unit ?? "units")} total</span>
      </div>
      <div class="stock-split" aria-label="Stock ownership split">
        <span class="stock-chip stock-chip-own">LC Stock <strong>${own}</strong></span>
        ${hasConsign ? `<span class="stock-chip stock-chip-consign">Consign <strong>${consignment}</strong></span>` : ""}
      </div>
    </div>
  `;
}

function renderConsignmentRestockCell(item) {
  const restock = getConsignmentUsed(item);
  return `
    <div class="location-stack">
      <span>${escapeHtml(item.location ?? "Main Store")}</span>
      ${restock ? `<span class="stock-restock stock-restock-alert">Need restock: ${escapeHtml(String(restock))}</span>` : ""}
    </div>
  `;
}

function getReceivingPurposeLabel(purpose) {
  if (purpose === "consignment") return "Supplier consign stock";
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
    parts.push(`${allocation.consignmentQuantity} to consign`);
  }
  if (allocation.ownQuantity > 0) {
    parts.push(`${allocation.ownQuantity} to LC Stock`);
  }
  if (!parts.length) return "No quantity allocated";

  const warning = allocation.extraConsignmentQuantity > 0
    ? ` (${allocation.extraConsignmentQuantity} above current consign restock need)`
    : "";
  return `${parts.join(" | ")}${warning}`;
}

function renderStockInAllocationChips(item, quantity, purpose = "own") {
  const allocation = calculateStockInAllocation(item, quantity, purpose);
  const chips = [];

  if (allocation.consignmentQuantity > 0) {
    chips.push(`<span class="inline-stock-chip inline-stock-chip-consign">Consign</span>`);
  }
  if (allocation.ownQuantity > 0) {
    chips.push(`<span class="inline-stock-chip inline-stock-chip-own">LC Stock</span>`);
  }
  if (allocation.extraConsignmentQuantity > 0) {
    chips.push(`<span class="inline-stock-chip inline-stock-chip-alert">Extra consign <strong>${allocation.extraConsignmentQuantity}</strong></span>`);
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

  return `${allocation.consignmentQuantity} from consign`;
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

function dedupeInventoryRecords(inventory) {
  const seen = new Set();

  return inventory.filter((item) => {
    const key = [
      item.brand ?? "",
      item.model ?? "",
      item.name ?? "",
      item.sku ?? "",
      item.unit ?? "",
      item.quantity ?? "",
      item.location ?? ""
    ].join("|");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
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

function upgradeLegacyInventory(inventory) {
  return dedupeInventoryRecords(
    inventory
      .filter((item) => !["MAT-001", "MAT-002"].includes(item.sku))
      .map((item) => normalizeInventoryRecord(item))
  );
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const normalizedDefaultData = {
      inventory: defaultData.inventory.map((item) => normalizeInventoryRecord(item)),
      adjustments: [],
      stockOuts: []
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedDefaultData));
    return structuredClone(normalizedDefaultData);
  }

  try {
    const parsed = JSON.parse(raw);
    const normalized = {
      inventory: upgradeLegacyInventory(parsed.inventory ?? []),
      adjustments: (parsed.adjustments ?? []).map((entry) => normalizeAdjustmentRecord(entry)),
      stockOuts: (parsed.stockOuts ?? []).map((entry) => normalizeStockOutRecord(entry))
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch (error) {
    const normalizedDefaultData = {
      inventory: defaultData.inventory.map((item) => normalizeInventoryRecord(item)),
      adjustments: [],
      stockOuts: []
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedDefaultData));
    return structuredClone(normalizedDefaultData);
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
          <div class="confirm-summary-card"><strong>${consignmentQuantity}</strong><span>To consign</span></div>
        </div>
        <div class="confirm-category-grid">
          ${renderSection("Adding to LC Stock", lcLines, "lc")}
          ${renderSection("Adding to Supplier Consign", consignmentLines, "consignment")}
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

function formatDateTime(value) {
  return new Date(value).toLocaleString();
}

function formatDateOnly(value) {
  return new Date(value).toLocaleDateString();
}

function formatUserSummary(user) {
  return `${escapeHtml(getUserDisplayName(user))} | ${escapeHtml(getUserRole(user))}`;
}

function handleSignOut() {
  clearCurrentUser();
  redirectToLogin();
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
  loginCopy.textContent = "Use one of the default accounts below so the system can record who creates, adds, and draws stock.";
  authPanel.innerHTML = `
    <section class="auth-panel">
      <div>
        <p class="eyebrow">User Login</p>
        <h2>Inventory access</h2>
        <p class="auth-copy">This version uses a browser-based login so each stock action can be tagged to a user.</p>
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
          <span class="form-hint">Credentials are stored locally for this demo setup.</span>
        </div>
      </form>
      <section class="auth-accounts">
        <p class="eyebrow">Default Accounts</p>
        <div class="auth-account-list">
          ${loadUsers().map((user) => `
            <article class="auth-account-card">
              <strong>${escapeHtml(user.name)}</strong>
              <span>${escapeHtml(user.role)}</span>
              <span>Username: ${escapeHtml(user.username)}</span>
              <span>Password: ${escapeHtml(user.password)}</span>
            </article>
          `).join("")}
        </div>
      </section>
    </section>
  `;

  const loginForm = document.querySelector("#login-form");
  if (!loginForm) return;

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(loginForm);
    const username = String(form.get("username") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const matchedUser = loadUsers().find((user) => user.username.toLowerCase() === username && user.password === password);

    if (!matchedUser) {
      showNotice(authPanel, "Invalid username or password.");
      return;
    }

    setCurrentUser(matchedUser.id);
    redirectAfterLogin();
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
      ? `<span class="stock-picker-chip-consign">Consign <strong>${consignmentQuantity}</strong></span>`
      : "";
    const totalMetric = consignmentQuantity > 0
      ? `<span class="stock-picker-chip-total">Total <strong>${Number(item.quantity ?? 0)}</strong></span>`
      : "";

    return `
      ${groupMarkup}
      <button type="button" class="stock-picker-option${item.id === selectedId ? " is-selected" : ""}" data-stock-picker-option="${item.id}" role="option" aria-selected="${item.id === selectedId ? "true" : "false"}">
        <span class="stock-picker-option-main">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.brand ?? "Generic")} / ${escapeHtml(item.sku ?? "-")} / ${escapeHtml(item.location ?? "Main Store")}</span>
        </span>
        <span class="stock-picker-option-metrics">
          <span class="stock-picker-chip-own">LC Stock <strong>${ownQuantity}</strong></span>
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
    ? `This item has consign stock to restock: ${restockQuantity}. Choose Supplier consign stock if this delivery is for consign.`
    : "";
}

function normalizeStockOutItems(record, inventory) {
  if (Array.isArray(record.items) && record.items.length) {
    return record.items.map((line) => ({
      ...line,
      ownQuantity: line.ownQuantity ?? line.quantity ?? 0,
      consignmentQuantity: line.consignmentQuantity ?? 0,
      ownBalanceAfter: line.ownBalanceAfter ?? line.balanceAfter ?? 0,
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
  const totalQuantity = rows.reduce((sum, row) => {
    const qty = Number(row.querySelector('input[name="issueQuantity"]')?.value ?? "0");
    return sum + Math.max(qty, 0);
  }, 0);

  rows.forEach((row) => {
    const item = inventory.find((entry) => entry.id === row.dataset.itemId);
    const qty = Number(row.querySelector('input[name="issueQuantity"]')?.value ?? "0");
    const availableCell = row.querySelector("[data-stock-out-available]");
    if (availableCell) {
      availableCell.innerHTML = item ? renderStockBreakdownChips(item) : "-";
    }
    const consignmentNotice = row.querySelector("[data-stock-out-consignment-notice]");
    if (consignmentNotice) {
      const noticeText = item ? renderConsignmentDrawNotice(item, qty) : "";
      consignmentNotice.hidden = !noticeText;
      consignmentNotice.textContent = noticeText;
    }
  });

  summary.textContent = `${totalLines} item line${totalLines === 1 ? "" : "s"} | Total issue quantity ${totalQuantity}`;
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
    quantityText: formatStockBreakdown(item),
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
        itemLine: `${item?.name ?? "Deleted item"} (${entry.stockType === "consignment" ? "Consign" : "LC Stock"} +${entry.quantity})`
      };
    });
    const totalQuantity = entries.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    const lcQuantity = entries
      .filter((entry) => entry.stockType !== "consignment")
      .reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    const consignQuantity = entries
      .filter((entry) => entry.stockType === "consignment")
      .reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    const detailParts = [];
    if (lcQuantity) detailParts.push(`${lcQuantity} to LC Stock`);
    if (consignQuantity) detailParts.push(`${consignQuantity} to Consign`);
    const detailHtml = `
      <div class="activity-stock-in-split">
        ${lcQuantity ? `<span class="inline-stock-chip inline-stock-chip-own">LC Stock <strong>${lcQuantity}</strong></span>` : ""}
        ${consignQuantity ? `<span class="inline-stock-chip inline-stock-chip-consign">Consign <strong>${consignQuantity}</strong></span>` : ""}
      </div>
    `;
    return {
      id: `adjust-${groupKey}`,
      type: "stock-in",
      sourceId: groupKey,
      title: "Stock Added",
      actor: firstEntry.actorName ?? "Unknown User",
      itemSummary: itemRows.map((row) => row.itemName).join(", "),
      itemLines: itemRows.map((row) => row.itemLine),
      detail: detailParts.length ? detailParts.join(" | ") : "No stock quantity recorded",
      detailHtml,
      quantityText: `+${totalQuantity}`,
      createdAt: firstEntry.createdAt,
      actions: []
    };
  });

  const stockOuts = data.stockOuts.map((entry) => {
    const items = normalizeStockOutItems(entry, data.inventory);
    const itemLines = items.map((line) => line.itemSnapshot?.name ?? "Item");
    const itemSummary = itemLines.join(", ");
    const totalQuantity = items.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const consignmentQuantity = items.reduce((sum, line) => sum + Number(line.consignmentQuantity || 0), 0);
    return {
      id: `draw-${entry.id}`,
      type: "stock-out",
      sourceId: entry.id,
      title: "Stock Drawn Out",
      actor: entry.createdByName ?? "Unknown User",
      itemSummary,
      itemLines,
      detail: `Document ${entry.documentNo} | Received by ${entry.receivedBy}`,
      quantityText: `-${totalQuantity}${consignmentQuantity ? ` (${consignmentQuantity} consign)` : ""}`,
      createdAt: entry.createdAt,
      actions: [
        { kind: "view-handover", label: "View Form", stockOutId: entry.id },
        { kind: "download-handover", label: "Download Form", stockOutId: entry.id }
      ]
    };
  });

  return [...inventoryCreates, ...stockIns, ...stockOuts]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getActivityDetailRecord(type, id, data) {
  if (type === "create") {
    const item = data.inventory.find((entry) => entry.id === id);
    if (!item) return null;
    return {
      type,
      title: "Stock Creation Record",
      actor: item.createdByName ?? "Unknown User",
      createdAt: item.createdAt,
      summary: item.name ?? item.sku ?? "Inventory item",
      detailRows: [
        { label: "Brand", value: item.brand ?? "Generic" },
        { label: "Model", value: item.model ?? "Standard" },
        { label: "Stock Code", value: item.sku ?? "-" },
        { label: "LC Stock", value: item.ownQuantity ?? item.quantity ?? 0 },
        { label: "Consign Available", value: item.consignmentQuantity ?? 0 },
        { label: "Consign To Restock", value: getConsignmentUsed(item) },
        { label: "Location", value: item.location ?? "Main Store" }
      ],
      itemRows: [{
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
    const firstAdjustment = adjustments[0];
    const totalQuantity = adjustments.reduce((sum, adjustment) => sum + Number(adjustment.quantity || 0), 0);
    const lcQuantity = adjustments
      .filter((adjustment) => adjustment.stockType !== "consignment")
      .reduce((sum, adjustment) => sum + Number(adjustment.quantity || 0), 0);
    const consignQuantity = adjustments
      .filter((adjustment) => adjustment.stockType === "consignment")
      .reduce((sum, adjustment) => sum + Number(adjustment.quantity || 0), 0);
    return {
      type,
      title: "Stock-In Record",
      actor: firstAdjustment.actorName ?? "Unknown User",
      createdAt: firstAdjustment.createdAt,
      summary: `${adjustments.length} stock-in line${adjustments.length === 1 ? "" : "s"}`,
      detailRows: [
        { label: "Total Quantity Added", value: `+${totalQuantity}` },
        { label: "LC Stock Added", value: `+${lcQuantity}` },
        { label: "Consign Added", value: `+${consignQuantity}` },
        { label: "Remarks", value: firstAdjustment.remarks || "No remarks provided" }
      ],
      itemRows: adjustments.map((adjustment) => {
        const item = data.inventory.find((entry) => entry.id === adjustment.itemId);
        return {
          brand: item?.brand ?? "Generic",
          model: item?.model ?? "Standard",
          name: item?.name ?? "Deleted item",
          sku: item?.sku ?? "-",
          quantity: adjustment.quantity ?? 0,
          ownQuantity: adjustment.stockType === "consignment" ? 0 : adjustment.quantity ?? 0,
          consignmentQuantity: adjustment.stockType === "consignment" ? adjustment.quantity ?? 0 : 0,
          consignmentToRestock: item ? getConsignmentUsed(item) : 0,
          unit: item?.unit ?? "-",
          location: item?.location ?? "Main Store"
        };
      }),
      handoverId: null
    };
  }

  if (type === "stock-out") {
    const stockOut = data.stockOuts.find((entry) => entry.id === id);
    if (!stockOut) return null;
    const items = normalizeStockOutItems(stockOut, data.inventory);
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
        { label: "Consign Issued", value: items.reduce((sum, line) => sum + Number(line.consignmentQuantity || 0), 0) }
      ],
      itemRows: items.map((line) => ({
        brand: line.itemSnapshot?.brand ?? "-",
        model: line.itemSnapshot?.model ?? "-",
        name: line.itemSnapshot?.name ?? "-",
        sku: line.itemSnapshot?.sku ?? "-",
        quantity: line.quantity ?? 0,
        unit: line.itemSnapshot?.unit ?? "-",
        location: line.itemSnapshot?.location ?? "-",
        balanceAfter: line.balanceAfter ?? 0,
        ownQuantity: line.ownQuantity ?? line.quantity ?? 0,
        consignmentQuantity: line.consignmentQuantity ?? 0,
        consignmentToRestock: line.consignmentToRestock ?? 0
      })),
      handoverId: stockOut.id
    };
  }

  return null;
}

function buildHandoverDocumentMarkup(record, items) {
  const totalIssuedQuantity = items.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const totalConsignmentIssued = items.reduce((sum, line) => sum + Number(line.consignmentQuantity || 0), 0);
  return `
    <section class="print-header">
      <div>
        <p class="eyebrow">Internal Company Form</p>
        <h1>Stock Handover Form</h1>
        <p>Document No: <strong>${escapeHtml(record.documentNo)}</strong></p>
      </div>
      <div>
        <p><strong>Date Issued:</strong> ${formatDateTime(record.createdAt)}</p>
        <p><strong>Project Title:</strong> ${escapeHtml(record.projectTitle ?? "-")}</p>
        <p><strong>Received By:</strong> ${escapeHtml(record.receivedBy ?? "-")}</p>
        <p><strong>Prepared By:</strong> ${escapeHtml(record.createdByName ?? "Unknown User")}</p>
      </div>
    </section>

    <section class="print-section print-grid">
      <div>
        <p><strong>Total Items:</strong> ${items.length}</p>
        <p><strong>Total Quantity Issued:</strong> ${totalIssuedQuantity}</p>
        <p><strong>Consign Issued:</strong> ${totalConsignmentIssued}</p>
        <p><strong>Project Title:</strong> ${escapeHtml(record.projectTitle ?? "-")}</p>
      </div>
      <div>
        <p><strong>Received By:</strong> ${escapeHtml(record.receivedBy ?? "-")}</p>
        <p><strong>Prepared By:</strong> ${escapeHtml(record.createdByName ?? "Unknown User")}</p>
        <p><strong>Date Issued:</strong> ${formatDateTime(record.createdAt)}</p>
        <p><strong>Document No:</strong> ${escapeHtml(record.documentNo)}</p>
      </div>
    </section>

    <section class="print-section">
      <table>
        <thead>
          <tr>
            <th>Brand</th>
            <th>Model</th>
            <th>Description</th>
            <th>Stock Code</th>
            <th>Quantity</th>
            <th>LC Stock</th>
            <th>Consign</th>
            <th>Unit</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((line) => {
            const item = line.itemSnapshot ?? {};
            return `
              <tr>
                <td>${escapeHtml(item.brand ?? "-")}</td>
                <td>${escapeHtml(item.model ?? "-")}</td>
                <td>${escapeHtml(item.name ?? "-")}</td>
                <td>${escapeHtml(item.sku ?? "-")}</td>
                <td>${line.quantity}</td>
                <td>${Number(line.ownQuantity || 0)}</td>
                <td>${Number(line.consignmentQuantity || 0)}</td>
                <td>${escapeHtml(item.unit ?? "-")}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </section>

    <section class="print-section print-grid">
      <div>
        <p><strong>Project Title:</strong></p>
        <p>${escapeHtml(record.projectTitle ?? "-")}</p>
      </div>
      <div>
        <p><strong>Items Issued:</strong> ${items.map((line) => escapeHtml(line.itemSnapshot?.name ?? "Item")).join("<br>")}</p>
        <p><strong>Remaining Balance Snapshot:</strong><br>${items.map((line) => `${escapeHtml(line.itemSnapshot?.sku ?? "-")}: ${Math.max(line.balanceAfter ?? 0, 0)} total, ${Math.max(line.consignmentToRestock ?? 0, 0)} consign to restock`).join("<br>")}</p>
      </div>
    </section>

    <section class="signatures">
      <div class="signature-line">Prepared By</div>
      <div class="signature-line">Received By</div>
      <div class="signature-line">Approved By</div>
    </section>
  `;
}

function downloadHandoverFile(stockOutId) {
  const data = loadData();
  const record = data.stockOuts.find((entry) => entry.id === stockOutId);
  if (!record) return;

  const items = normalizeStockOutItems(record, data.inventory);
  const documentMarkup = buildHandoverDocumentMarkup(record, items);
  const exportHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(record.documentNo)} | Stock Handover Form</title>
  <link rel="stylesheet" href="styles.css">
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

function getValidFilterValue(currentValue, storedValue, values) {
  const preferredValue = storedValue ?? currentValue;
  return values.includes(preferredValue) ? preferredValue : "all";
}

function renderInventoryPage() {
  const data = loadData();
  const summary = document.querySelector("#inventory-summary");
  const tableBody = document.querySelector("#inventory-table");
  const paginationSummary = document.querySelector("#inventory-pagination-summary");
  const pagination = document.querySelector("#inventory-pagination");
  const searchInput = document.querySelector("#inventory-search");
  const brandFilter = document.querySelector("#inventory-brand-filter");
  const modelFilter = document.querySelector("#inventory-model-filter");
  const statusFilter = document.querySelector("#inventory-status-filter");
  const pageSizeSelect = document.querySelector("#inventory-page-size");
  const clearFiltersButton = document.querySelector("#inventory-clear-filters");
  const pageKey = "ims-inventory-page";
  const searchKey = "ims-inventory-search";
  const filterKey = "ims-inventory-filter";
  const brandKey = "ims-inventory-brand-filter";
  const modelKey = "ims-inventory-model-filter";
  const pageSizeKey = "ims-inventory-page-size";
  localStorage.removeItem("ims-inventory-location-filter");
  const rawSearch = localStorage.getItem(searchKey) ?? searchInput?.value ?? "";
  const searchTerm = rawSearch.trim().toLowerCase();
  const brands = getUniqueInventoryValues(data.inventory, "brand");
  const models = getUniqueInventoryValues(data.inventory, "model");
  const activeBrand = getValidFilterValue(brandFilter?.value, localStorage.getItem(brandKey), brands);
  const activeModel = getValidFilterValue(modelFilter?.value, localStorage.getItem(modelKey), models);
  const rawStatusFilter = localStorage.getItem(filterKey) ?? statusFilter?.value ?? "all";
  const activeFilter = ["all", "low-stock", "in-stock", "out-of-stock"].includes(rawStatusFilter) ? rawStatusFilter : "all";
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
  populateFilterSelect(modelFilter, models, activeModel, "All categories");

  if (statusFilter && statusFilter.value !== activeFilter) {
    statusFilter.value = activeFilter;
  }

  if (pageSizeSelect && String(pageSizeSelect.value) !== String(pageSize)) {
    pageSizeSelect.value = String(pageSize);
  }

  if (summary) {
    summary.innerHTML = `
      <div class="summary-line"><strong>${data.inventory.length}</strong><span>Items in register</span></div>
      <div class="summary-line"><strong>${totalQuantity}</strong><span>Total on hand (${totalOwnQuantity} LC Stock / ${totalConsignmentQuantity} consign)</span></div>
      <div class="summary-line"><strong>${totalConsignmentToRestock}</strong><span>Consign to restock</span></div>
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
    if (activeModel !== "all" && item.model !== activeModel) return false;
    if (activeFilter === "low-stock") return item.quantity <= (item.reorderLevel ?? 0);
    if (activeFilter === "in-stock") return item.quantity > 0;
    if (activeFilter === "out-of-stock") return item.quantity <= 0;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredInventory.length / pageSize));
  const currentPage = Math.min(Math.max(Number(localStorage.getItem(pageKey) || "1"), 1), totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageItems = filteredInventory.slice(startIndex, endIndex);
  const hasActiveFilters = Boolean(searchTerm)
    || activeBrand !== "all"
    || activeModel !== "all"
    || activeFilter !== "all";

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
          <td><strong>${escapeHtml(item.name)}</strong></td>
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
      }</div></td></tr>`;

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

  if (statusFilter && !statusFilter.dataset.bound) {
    statusFilter.addEventListener("change", () => {
      localStorage.setItem(filterKey, statusFilter.value);
      localStorage.setItem(pageKey, "1");
      renderInventoryPage();
    });
    statusFilter.dataset.bound = "true";
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
      [searchKey, filterKey, brandKey, modelKey].forEach((key) => localStorage.removeItem(key));
      if (searchInput) searchInput.value = "";
      [brandFilter, modelFilter, statusFilter].forEach((filter) => {
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
  const typeFilter = document.querySelector("#activity-type-filter");
  const actorFilter = document.querySelector("#activity-actor-filter");
  const dateFromFilter = document.querySelector("#activity-date-from-filter");
  const dateToFilter = document.querySelector("#activity-date-to-filter");
  const clearFiltersButton = document.querySelector("#activity-clear-filters");
  if (!activityTableBody || !activitySummary || !typeFilter || !actorFilter || !dateFromFilter || !dateToFilter) return;

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

  actorFilter.innerHTML = `
    <option value="all">All users</option>
    ${actors.map((actor) => `<option value="${escapeHtml(actor)}">${escapeHtml(actor)}</option>`).join("")}
  `;

  if (Array.from(actorFilter.options).some((option) => option.value === selectedActor)) {
    actorFilter.value = selectedActor;
  } else {
    actorFilter.value = "all";
  }

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
  const hasDateFilter = Boolean(selectedDateFrom || selectedDateTo);

  if (!filteredEvents.length && allEvents.length && hasDateFilter && filterEvents("", "").length) {
    localStorage.removeItem(dateFromKey);
    localStorage.removeItem(dateToKey);
    dateFromFilter.value = "";
    dateToFilter.value = "";
    filteredEvents = filterEvents("", "");
  }

  const hasActiveActivityFilters = selectedType !== "all"
    || actorFilter.value !== "all"
    || Boolean(dateFromFilter.value || dateToFilter.value);

  activitySummary.textContent = filteredEvents.length
    ? `${filteredEvents.length} accountability event${filteredEvents.length === 1 ? "" : "s"} shown`
    : hasActiveActivityFilters
      ? "No activity matched the selected filters. Clear filters to show all activity."
      : "No activity has been recorded yet";

  activityTableBody.innerHTML = filteredEvents.length
    ? filteredEvents.map((event) => `
        <tr>
          <td>
            <strong>${escapeHtml(formatDateTime(event.createdAt))}</strong>
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
              ${event.detailHtml ?? `<span>${escapeHtml(event.detail)}</span>`}
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
                : `<span class="muted">No form</span>`}
            </div>
          </td>
        </tr>
      `).join("")
    : `<tr><td colspan="7"><div class="empty-state">${
        hasActiveActivityFilters
          ? "No stock creation, stock-in, or stock-out activity matched the selected filters."
          : "No stock creation, stock-in, or stock-out activity has been recorded yet."
      }</div></td></tr>`;

  activityTableBody.querySelectorAll("[data-download-handover]").forEach((button) => {
    if (button.dataset.bound) return;
    button.addEventListener("click", () => downloadHandoverFile(button.dataset.downloadHandover));
    button.dataset.bound = "true";
  });

  if (!typeFilter.dataset.bound) {
    typeFilter.addEventListener("change", () => {
      renderActivityHistoryPage();
    });
    typeFilter.dataset.bound = "true";
  }

  if (!actorFilter.dataset.bound) {
    actorFilter.addEventListener("change", () => {
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
      renderActivityHistoryPage();
    });
    filter.dataset.bound = "true";
  });

  if (clearFiltersButton && !clearFiltersButton.dataset.bound) {
    clearFiltersButton.addEventListener("click", () => {
      [dateFromKey, dateToKey].forEach((key) => localStorage.removeItem(key));
      typeFilter.value = "all";
      actorFilter.value = "all";
      dateFromFilter.value = "";
      dateToFilter.value = "";
      renderActivityHistoryPage();
    });
    clearFiltersButton.dataset.bound = "true";
  }
}

function initCreateStockPage() {
  const content = document.querySelector(".main-shell");
  const inventoryForm = document.querySelector("#inventory-form");
  if (!content || !inventoryForm) return;

  if (!inventoryForm.dataset.bound) {
    inventoryForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(inventoryForm);
      const nextData = loadData();
      const currentUser = getCurrentUser();
      const timestamp = new Date().toISOString();
      const userStamp = buildUserStamp(currentUser);
      const ownQuantity = Math.max(Number(form.get("quantity") || "0"), 0);
      const consignmentQuantity = Math.max(Number(form.get("consignmentQuantity") || "0"), 0);

      nextData.inventory.push({
        id: crypto.randomUUID(),
        brand: form.get("brand").trim(),
        model: form.get("model").trim(),
        name: form.get("name").trim(),
        sku: form.get("sku").trim(),
        unit: form.get("unit").trim(),
        quantity: ownQuantity + consignmentQuantity,
        ownQuantity,
        consignmentQuantity,
        consignmentBaseline: consignmentQuantity,
        reorderLevel: 0,
        location: form.get("location").trim(),
        createdAt: timestamp,
        lastUpdatedAt: timestamp,
        ...userStamp
      });

      saveData(nextData);
      inventoryForm.reset();
      showNotice(content, `Inventory item saved under ${getUserDisplayName(currentUser)}.`);
    });
    inventoryForm.dataset.bound = "true";
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
      const timestamp = new Date().toISOString();
      const stockInSessionId = crypto.randomUUID();
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

      lineItems.forEach((line) => {
        const item = nextData.inventory.find((record) => record.id === line.itemId);
        if (!item) return;
        const allocation = calculateStockInAllocation(item, line.quantity, line.receivingPurpose);

        if (allocation.consignmentQuantity > 0) {
          item.consignmentQuantity = Math.max(Number(item.consignmentQuantity ?? 0), 0) + allocation.consignmentQuantity;
          item.consignmentBaseline = Math.max(Number(item.consignmentBaseline ?? 0), item.consignmentQuantity);
        }
        if (allocation.ownQuantity > 0) {
          item.ownQuantity = Math.max(Number(item.ownQuantity ?? item.quantity ?? 0), 0) + allocation.ownQuantity;
        }

        syncInventoryTotals(item);
        item.lastUpdatedAt = timestamp;
        item.lastUpdatedByUserId = currentUser?.id ?? null;
        item.lastUpdatedByName = getUserDisplayName(currentUser);

        [
          { stockType: "consignment", quantity: allocation.consignmentQuantity },
          { stockType: "own", quantity: allocation.ownQuantity }
        ].filter((entry) => entry.quantity > 0).forEach((entry) => {
          nextData.adjustments.push({
            id: crypto.randomUUID(),
            itemId: item.id,
            type: "add",
            stockInSessionId,
            stockType: entry.stockType,
            receivingPurpose: line.receivingPurpose,
            quantity: entry.quantity,
            receivedQuantity: line.quantity,
            remarks: "",
            createdAt: timestamp,
            actorUserId: currentUser?.id ?? null,
            actorName: getUserDisplayName(currentUser)
          });
        });
      });

      saveData(nextData);
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
  const stockOutLines = document.querySelector("#stock-out-lines");
  const stockOutEmpty = document.querySelector("#stock-out-empty");
  const stockOutSummary = document.querySelector("#stock-out-summary");
  const stockPicker = document.querySelector("[data-stock-picker]");
  const stockPickerButton = document.querySelector("#stock-picker-button");
  const stockPickerPopover = document.querySelector("#stock-picker-popover");
  const stockPickerSearch = document.querySelector("#stock-picker-search");
  const stockPickerList = document.querySelector("#stock-picker-list");
  const addStockOutLineButton = document.querySelector("#add-stock-out-line");
  const stockOutForm = document.querySelector("#stock-out-form");
  if (!content || !stockOutItemSelect || !stockOutQuantityInput || !stockOutLines || !stockOutEmpty || !stockOutSummary || !addStockOutLineButton || !stockOutForm) {
    return;
  }

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
    renderStockOutIssueList(stockOutLines, stockOutEmpty, stockOutSummary, data.inventory);
  };

  refreshDrawStockOptions();

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
      renderStockPickerList(stockPickerList, currentData.inventory, stockOutItemSelect.value, stockPickerSearch?.value ?? "");
    });

    addStockOutLineButton.addEventListener("click", () => {
      const currentData = loadData();
      const itemId = stockOutItemSelect.value;
      const quantity = Number(stockOutQuantityInput.value || "0");
      const item = currentData.inventory.find((entry) => entry.id === itemId);

      if (!itemId || !item || quantity <= 0) {
        showNotice(content, "Choose an item and enter a valid quantity before adding it to the issue list.");
        return;
      }

      const existingRow = stockOutLines.querySelector(`[data-item-id="${itemId}"]`);
      if (existingRow) {
        const quantityInput = existingRow.querySelector('input[name="issueQuantity"]');
        quantityInput.value = Number(quantityInput.value || "0") + quantity;
      } else {
        stockOutLines.insertAdjacentHTML("beforeend", `
          <tr data-stock-out-item-row data-item-id="${item.id}">
            <td><strong>${escapeHtml(item.name)}</strong><br><span class="muted">${escapeHtml(item.brand ?? "Generic")} / ${escapeHtml(item.model ?? "Standard")}</span></td>
            <td>${escapeHtml(item.sku)}</td>
            <td data-stock-out-available>${renderStockBreakdownChips(item)}</td>
            <td>
              <input class="stock-out-qty-input" name="issueQuantity" type="number" min="1" step="1" value="${quantity}">
              <span class="consignment-use-hint" data-stock-out-consignment-notice${renderConsignmentDrawNotice(item, quantity) ? "" : " hidden"}>${escapeHtml(renderConsignmentDrawNotice(item, quantity))}</span>
            </td>
            <td>${escapeHtml(item.unit ?? "-")}</td>
            <td><button type="button" class="button-link stock-out-line-remove" data-stock-out-remove>Remove</button></td>
          </tr>
        `);
      }

      stockOutQuantityInput.value = "1";
      renderStockOutIssueList(stockOutLines, stockOutEmpty, stockOutSummary, currentData.inventory);
    });

    stockOutForm.addEventListener("click", (event) => {
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

    stockOutForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(stockOutForm);
      const nextData = loadData();
      const currentUser = getCurrentUser();
      const timestamp = new Date().toISOString();
      const lineItems = Array.from(stockOutForm.querySelectorAll("[data-stock-out-item-row]"))
        .map((line) => ({
          itemId: line.dataset.itemId ?? "",
          quantity: Number(line.querySelector('input[name="issueQuantity"]')?.value ?? "0")
        }))
        .filter((line) => line.itemId && line.quantity > 0);

      if (!lineItems.length) {
        showNotice(content, "Add at least one stock-out item with a valid quantity.");
        return;
      }

      const requestedByItem = lineItems.reduce((map, line) => {
        map.set(line.itemId, (map.get(line.itemId) ?? 0) + line.quantity);
        return map;
      }, new Map());

      for (const [itemId, requestedQty] of requestedByItem.entries()) {
        const item = nextData.inventory.find((record) => record.id === itemId);
        if (!item) {
          showNotice(content, "One of the selected items could not be found.");
          return;
        }
        if (requestedQty > item.quantity) {
          showNotice(content, `Stock-out quantity for ${item.name} cannot be greater than the available quantity on hand.`);
          return;
        }
      }

      const issuedItems = lineItems.map((line) => {
        const item = nextData.inventory.find((record) => record.id === line.itemId);
        const ownBefore = Math.max(Number(item.ownQuantity ?? item.quantity ?? 0), 0);
        const consignmentBefore = Math.max(Number(item.consignmentQuantity ?? 0), 0);
        const ownIssued = Math.min(line.quantity, ownBefore);
        const consignmentIssued = line.quantity - ownIssued;
        item.ownQuantity = ownBefore - ownIssued;
        item.consignmentQuantity = consignmentBefore - consignmentIssued;
        syncInventoryTotals(item);
        item.lastUpdatedAt = timestamp;
        item.lastUpdatedByUserId = currentUser?.id ?? null;
        item.lastUpdatedByName = getUserDisplayName(currentUser);
        return {
          itemId: item.id,
          quantity: line.quantity,
          ownQuantity: ownIssued,
          consignmentQuantity: consignmentIssued,
          balanceAfter: item.quantity,
          ownBalanceAfter: item.ownQuantity,
          consignmentBalanceAfter: item.consignmentQuantity,
          consignmentToRestock: getConsignmentUsed(item),
          itemSnapshot: createItemSnapshot(item)
        };
      });

      const stockOutRecord = {
        id: crypto.randomUUID(),
        documentNo: `HF-${new Date().getFullYear()}-${String(nextData.stockOuts.length + 1).padStart(4, "0")}`,
        items: issuedItems,
        projectTitle: form.get("projectTitle").trim(),
        receivedBy: form.get("receivedBy").trim(),
        createdAt: timestamp,
        createdByUserId: currentUser?.id ?? null,
        createdByName: getUserDisplayName(currentUser)
      };

      const totalConsignmentIssued = issuedItems.reduce((sum, item) => sum + Number(item.consignmentQuantity || 0), 0);
      nextData.stockOuts.push(stockOutRecord);
      saveData(nextData);
      stockOutForm.reset();
      if (stockOutLines && stockOutEmpty && stockOutSummary) {
        stockOutLines.innerHTML = "";
        renderStockOutIssueList(stockOutLines, stockOutEmpty, stockOutSummary, nextData.inventory);
      }
      refreshDrawStockOptions();
      showToast(`Stock withdrawn by ${getUserDisplayName(currentUser)}. Handover form ${stockOutRecord.documentNo} created.${totalConsignmentIssued ? ` ${totalConsignmentIssued} consign item(s) must be restocked.` : ""}`);
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
    <section class="panel project-card">
      <header>
        <div class="project-meta">
          <p class="eyebrow">Activity Record</p>
          <h3>${escapeHtml(record.title)}</h3>
          <p class="section-copy">${escapeHtml(record.summary)}</p>
        </div>
        <span class="activity-tag activity-tag-${escapeHtml(record.type)}">${escapeHtml(record.type.replace("-", " "))}</span>
      </header>
      <div class="metric-grid">
        <div class="metric-card">
          <strong>${escapeHtml(formatDateTime(record.createdAt))}</strong>
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

    <section class="panel project-card">
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
      <div class="metric-grid">
        ${record.detailRows.map((row) => `
          <div class="metric-card">
            <strong>${escapeHtml(row.value)}</strong>
            <span>${escapeHtml(row.label)}</span>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="panel">
      <div class="panel-header panel-header-tight">
        <div>
          <p class="eyebrow">Item Breakdown</p>
          <h3>Detailed line items</h3>
          <p class="section-copy">Review the item-level quantity and reference details for this activity record.</p>
        </div>
      </div>
      <div class="table-wrap elevated-table">
        <table>
          <thead>
            <tr>
              <th>Brand</th>
              <th>Model</th>
              <th>Description</th>
              <th>Stock Code</th>
              <th>Quantity</th>
              <th>LC Stock</th>
              <th>Consign</th>
              <th>Unit</th>
              <th>Location</th>
              ${record.type === "stock-out" ? "<th>Balance After</th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${record.itemRows.map((item) => `
              <tr>
                <td>${escapeHtml(item.brand)}</td>
                <td>${escapeHtml(item.model)}</td>
                <td><strong>${escapeHtml(item.name)}</strong></td>
                <td>${escapeHtml(item.sku)}</td>
                <td>${escapeHtml(String(item.quantity))}</td>
                <td>${escapeHtml(String(item.ownQuantity ?? 0))}</td>
                <td>${escapeHtml(String(item.consignmentQuantity ?? 0))}${item.consignmentToRestock ? `<br><span class="muted">${escapeHtml(String(item.consignmentToRestock))} to restock</span>` : ""}</td>
                <td>${escapeHtml(item.unit)}</td>
                <td>${escapeHtml(item.location)}</td>
                ${record.type === "stock-out" ? `<td>${escapeHtml(String(item.balanceAfter ?? 0))}</td>` : ""}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function resetPageScroll() {
  const jumpToTop = () => window.scrollTo(0, 0);
  jumpToTop();
  requestAnimationFrame(jumpToTop);
  setTimeout(jumpToTop, 0);
  setTimeout(jumpToTop, 120);
}

document.addEventListener("DOMContentLoaded", () => {
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
  resetPageScroll();
  const currentUser = ensureAuthenticatedSession();
  if (PROTECTED_PAGES.has(document.body.dataset.page) && !currentUser) {
    return;
  }
  initLoginPage(currentUser);
  initHomePage(currentUser);
  initAuthChrome(currentUser);
  applyRoleNavigation(currentUser);
  if (["inventory", "activity-history", "activity-detail", "add-stock", "draw-stock"].includes(document.body.dataset.page)) {
    initSidebar();
  }
  initSectionNavigation();
  const modalController = initModals();
  initCollapsibles();
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
