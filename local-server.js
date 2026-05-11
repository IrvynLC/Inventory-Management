const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const host = process.env.IMS_HOST || "127.0.0.1";
const port = Number(process.env.IMS_PORT || 3000);
const root = __dirname;
const sqliteDatabasePath = process.env.IMS_SQLITE_MIGRATION_PATH || path.join(root, "data", "inventory.sqlite");

const defaultData = {
  inventory: [],
  adjustments: [],
  stockOuts: [],
  corrections: [],
  relocations: []
};

const defaultUsers = [
  { id: "user-fenny", username: "fenny", password: "1234", name: "Fenny", role: "Admin" },
  { id: "user-albert", username: "albert", password: "1234", name: "Albert", role: "Admin" },
  { id: "user-zin", username: "zin", password: "1234", name: "Zin", role: "Engineer" },
  { id: "user-irvyn", username: "irvyn", password: "1234", name: "Irvyn", role: "Engineer" },
  { id: "user-johnson", username: "johnson", password: "1234", name: "Johnson", role: "Administrative" },
  { id: "user-cindy", username: "cindy", password: "1234", name: "Cindy", role: "Administrative" }
];

const sessionCookieName = "ims_session";
const sessionTtlMs = Number(process.env.IMS_SESSION_TTL_HOURS || 12) * 60 * 60 * 1000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "inventory_management",
  user: process.env.PGUSER || "inventory_app",
  password: process.env.PGPASSWORD || "change-me",
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

function normalizeData(data) {
  return {
    inventory: Array.isArray(data?.inventory) ? data.inventory : [],
    adjustments: Array.isArray(data?.adjustments) ? data.adjustments : [],
    stockOuts: Array.isArray(data?.stockOuts) ? data.stockOuts : [],
    corrections: Array.isArray(data?.corrections) ? data.corrections : [],
    relocations: Array.isArray(data?.relocations) ? data.relocations : []
  };
}

function hasMeaningfulData(data) {
  return ["inventory", "adjustments", "stockOuts", "corrections", "relocations"]
    .some((key) => Array.isArray(data?.[key]) && data[key].length > 0);
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const iterations = 210000;
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const [algorithm, iterationText, salt, expectedHash] = String(storedHash || "").split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterationText || !salt || !expectedHash) return false;

  const iterations = Number(iterationText);
  const actualHash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256");
  const expectedBuffer = Buffer.from(expectedHash, "base64url");
  return expectedBuffer.length === actualHash.length && crypto.timingSafeEqual(expectedBuffer, actualHash);
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function sanitizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role
  };
}

function parseCookies(req) {
  return String(req.headers.cookie || "")
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .reduce((cookies, pair) => {
      const index = pair.indexOf("=");
      if (index === -1) return cookies;
      cookies[decodeURIComponent(pair.slice(0, index))] = decodeURIComponent(pair.slice(index + 1));
      return cookies;
    }, {});
}

function buildCookie(name, value, options = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  parts.push("Path=/", "HttpOnly", "SameSite=Lax");
  if (process.env.IMS_SECURE_COOKIES === "1") parts.push("Secure");
  return parts.join("; ");
}

function readSqliteMigrationData() {
  if (!fs.existsSync(sqliteDatabasePath)) return null;

  try {
    const { DatabaseSync } = require("node:sqlite");
    const sqlite = new DatabaseSync(sqliteDatabasePath, { readOnly: true });
    const row = sqlite.prepare("SELECT data_json FROM app_state WHERE id = 1").get();
    sqlite.close();
    if (!row?.data_json) return null;
    return normalizeData(JSON.parse(row.data_json));
  } catch (error) {
    console.warn(`Could not read SQLite migration data from ${sqliteDatabasePath}: ${error.message}`);
    return null;
  }
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS app_revisions (
      id BIGSERIAL PRIMARY KEY,
      data_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      source TEXT NOT NULL DEFAULT 'api'
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);

  for (const user of defaultUsers) {
    await pool.query(
      `
        INSERT INTO users (id, username, password_hash, name, role)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE
          SET username = EXCLUDED.username,
              name = EXCLUDED.name,
              role = EXCLUDED.role,
              updated_at = now()
      `,
      [user.id, user.username, createPasswordHash(user.password), user.name, user.role]
    );
  }

  await pool.query("DELETE FROM sessions WHERE expires_at <= now()");

  const stateResult = await pool.query("SELECT data_json FROM app_state WHERE id = 1");
  if (!stateResult.rowCount) {
    const migrationData = readSqliteMigrationData();
    const seedData = hasMeaningfulData(migrationData) ? migrationData : defaultData;
    const source = hasMeaningfulData(migrationData) ? "sqlite-migration" : "seed";
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO app_state (id, data_json) VALUES (1, $1::jsonb)",
        [JSON.stringify(seedData)]
      );
      await client.query(
        "INSERT INTO app_revisions (data_json, source) VALUES ($1::jsonb, $2)",
        [JSON.stringify(seedData), source]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function readRequestBody(req, maxBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function getSessionUser(req) {
  const token = parseCookies(req)[sessionCookieName];
  if (!token) return null;

  const result = await pool.query(
    `
      SELECT u.id, u.username, u.name, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > now()
        AND u.is_active = true
    `,
    [hashSessionToken(token)]
  );

  return sanitizeUser(result.rows[0]);
}

async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionTtlMs);
  await pool.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [hashSessionToken(token), userId, expiresAt]
  );
  res.setHeader("Set-Cookie", buildCookie(sessionCookieName, token, {
    maxAge: Math.floor(sessionTtlMs / 1000),
    expires: expiresAt
  }));
}

async function destroySession(req, res) {
  const token = parseCookies(req)[sessionCookieName];
  if (token) {
    await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashSessionToken(token)]);
  }
  res.setHeader("Set-Cookie", buildCookie(sessionCookieName, "", {
    maxAge: 0,
    expires: new Date(0)
  }));
}

async function requireSessionUser(req, res) {
  const user = await getSessionUser(req);
  if (!user) {
    sendJson(res, 401, { ok: false, error: "Authentication required" });
    return null;
  }
  return user;
}

async function getState() {
  const stateResult = await pool.query("SELECT data_json, updated_at FROM app_state WHERE id = 1");
  const revisionResult = await pool.query("SELECT COALESCE(MAX(id), 0) AS revision FROM app_revisions");
  const row = stateResult.rows[0];
  return {
    data: normalizeData(row?.data_json ?? defaultData),
    updatedAt: row?.updated_at,
    revision: Number(revisionResult.rows[0]?.revision ?? 0)
  };
}

async function saveState(data) {
  const normalized = normalizeData(data);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE app_state SET data_json = $1::jsonb, updated_at = now() WHERE id = 1",
      [JSON.stringify(normalized)]
    );
    await client.query(
      "INSERT INTO app_revisions (data_json, source) VALUES ($1::jsonb, 'api')",
      [JSON.stringify(normalized)]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getState();
}

function toCleanText(value, fallback = "") {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function toNonNegativeInt(value) {
  const number = Math.floor(Number(value ?? 0));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeStockCondition(value) {
  const condition = String(value ?? "").trim().toLowerCase();
  return ["used", "use", "yes", "y", "true", "1"].includes(condition) ? "used" : "new";
}

function syncInventoryTotals(item) {
  item.ownQuantity = Math.max(Number(item.ownQuantity ?? item.quantity ?? 0), 0);
  item.consignmentQuantity = Math.max(Number(item.consignmentQuantity ?? 0), 0);
  item.consignmentBaseline = Math.max(Number(item.consignmentBaseline ?? item.consignmentQuantity ?? 0), item.consignmentQuantity);
  item.quantity = item.ownQuantity + item.consignmentQuantity;
  return item;
}

function getConsignmentUsed(item) {
  return Math.max(Number(item.consignmentBaseline ?? item.consignmentQuantity ?? 0) - Number(item.consignmentQuantity ?? 0), 0);
}

function createItemSnapshot(item) {
  return {
    id: item.id,
    brand: item.brand,
    model: item.model,
    name: item.name,
    sku: item.sku,
    unit: item.unit,
    quantity: Number(item.quantity ?? 0),
    ownQuantity: Number(item.ownQuantity ?? item.quantity ?? 0),
    consignmentQuantity: Number(item.consignmentQuantity ?? 0),
    location: item.location,
    stockCondition: item.stockCondition
  };
}

function calculateStockInAllocation(item, receivedQuantity, receivingPurpose) {
  const quantity = toNonNegativeInt(receivedQuantity);
  if (receivingPurpose === "consignment") {
    return { ownQuantity: 0, consignmentQuantity: quantity };
  }

  const consignmentToRestock = getConsignmentUsed(item);
  const consignmentQuantity = Math.min(quantity, consignmentToRestock);
  return {
    ownQuantity: quantity - consignmentQuantity,
    consignmentQuantity
  };
}

function getDocumentYear(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
}

function getNextHandoverDocumentNo(data, timestamp) {
  const year = getDocumentYear(timestamp);
  const usedNumbers = new Set((data.stockOuts ?? [])
    .map((record) => String(record.documentNo ?? ""))
    .map((documentNo) => {
      const match = documentNo.match(/^HF-(\d{4})-(\d+)$/);
      return match && Number(match[1]) === year ? Number(match[2]) : 0;
    })
    .filter(Boolean));

  let nextNumber = 1;
  while (usedNumbers.has(nextNumber)) nextNumber += 1;
  return `HF-${year}-${String(nextNumber).padStart(4, "0")}`;
}

async function mutateState(source, mutator) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const stateResult = await client.query("SELECT data_json FROM app_state WHERE id = 1 FOR UPDATE");
    const data = normalizeData(stateResult.rows[0]?.data_json ?? defaultData);
    const result = await mutator(data);
    await client.query(
      "UPDATE app_state SET data_json = $1::jsonb, updated_at = now() WHERE id = 1",
      [JSON.stringify(data)]
    );
    await client.query(
      "INSERT INTO app_revisions (data_json, source) VALUES ($1::jsonb, $2)",
      [JSON.stringify(data), source]
    );
    await client.query("COMMIT");
    const revisionResult = await pool.query("SELECT COALESCE(MAX(id), 0) AS revision FROM app_revisions");
    return {
      ok: true,
      data,
      revision: Number(revisionResult.rows[0]?.revision ?? 0),
      ...result
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function handleCreateStockAction(user, payload) {
  return mutateState("action:create-stock", async (data) => {
    const timestamp = new Date().toISOString();
    const ownQuantity = toNonNegativeInt(payload.ownQuantity);
    const consignmentQuantity = toNonNegativeInt(payload.consignmentQuantity);
    const item = {
      id: crypto.randomUUID(),
      brand: toCleanText(payload.brand),
      model: toCleanText(payload.model),
      name: toCleanText(payload.name),
      sku: toCleanText(payload.sku),
      unit: toCleanText(payload.unit),
      quantity: ownQuantity + consignmentQuantity,
      ownQuantity,
      consignmentQuantity,
      consignmentBaseline: consignmentQuantity,
      stockCondition: normalizeStockCondition(payload.stockCondition),
      reorderLevel: 0,
      location: toCleanText(payload.location),
      createdAt: timestamp,
      lastUpdatedAt: timestamp,
      createdByUserId: user.id,
      createdByName: user.name,
      lastUpdatedByUserId: user.id,
      lastUpdatedByName: user.name
    };

    if (!item.brand || !item.model || !item.name || !item.sku || !item.unit || !item.location) {
      throw new Error("Complete all item details before saving.");
    }

    data.inventory.push(item);
    return { item };
  });
}

async function handleRelocateStockAction(user, payload) {
  return mutateState("action:relocate-stock", async (data) => {
    const item = data.inventory.find((record) => record.id === payload.itemId);
    if (!item) throw new Error("The selected inventory item could not be found.");

    const fromLocation = toCleanText(item.location, "Main Store");
    const toLocation = toCleanText(payload.toLocation);
    if (!toLocation) throw new Error("Enter the new storage location before saving.");
    if (toLocation.toLowerCase() === fromLocation.toLowerCase()) {
      throw new Error("The new location is the same as the current location.");
    }

    const timestamp = new Date().toISOString();
    const relocation = {
      id: crypto.randomUUID(),
      itemId: item.id,
      itemSnapshot: createItemSnapshot(item),
      fromLocation,
      toLocation,
      remarks: toCleanText(payload.remarks),
      createdAt: timestamp,
      actorName: user.name,
      actorUserId: user.id
    };

    item.location = toLocation;
    item.lastUpdatedAt = timestamp;
    item.lastUpdatedByName = user.name;
    item.lastUpdatedByUserId = user.id;
    data.relocations = [...(data.relocations ?? []), relocation];
    return { relocation };
  });
}

async function handleAddStockAction(user, payload) {
  return mutateState("action:add-stock", async (data) => {
    const timestamp = new Date().toISOString();
    const stockInSessionId = crypto.randomUUID();
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    if (!lines.length) throw new Error("Add at least one stock item with a valid quantity.");

    lines.forEach((line) => {
      const item = data.inventory.find((record) => record.id === line.itemId);
      const quantity = toNonNegativeInt(line.quantity);
      const receivingPurpose = line.receivingPurpose === "consignment" ? "consignment" : "own";
      if (!item || quantity <= 0) throw new Error("One of the selected stock-in items is invalid.");

      const allocation = calculateStockInAllocation(item, quantity, receivingPurpose);
      const balanceBefore = {
        quantity: Number(item.quantity ?? 0),
        ownQuantity: Number(item.ownQuantity ?? item.quantity ?? 0),
        consignmentQuantity: Number(item.consignmentQuantity ?? 0),
        consignmentBaseline: Number(item.consignmentBaseline ?? item.consignmentQuantity ?? 0),
        consignmentToRestock: getConsignmentUsed(item)
      };

      if (allocation.consignmentQuantity > 0) {
        item.consignmentQuantity = Math.max(Number(item.consignmentQuantity ?? 0), 0) + allocation.consignmentQuantity;
        item.consignmentBaseline = Math.max(Number(item.consignmentBaseline ?? 0), item.consignmentQuantity);
      }
      if (allocation.ownQuantity > 0) {
        item.ownQuantity = Math.max(Number(item.ownQuantity ?? item.quantity ?? 0), 0) + allocation.ownQuantity;
      }

      syncInventoryTotals(item);
      item.lastUpdatedAt = timestamp;
      item.lastUpdatedByUserId = user.id;
      item.lastUpdatedByName = user.name;
      const balanceAfter = {
        quantity: Number(item.quantity ?? 0),
        ownQuantity: Number(item.ownQuantity ?? item.quantity ?? 0),
        consignmentQuantity: Number(item.consignmentQuantity ?? 0),
        consignmentBaseline: Number(item.consignmentBaseline ?? item.consignmentQuantity ?? 0),
        consignmentToRestock: getConsignmentUsed(item)
      };

      [
        { stockType: "consignment", quantity: allocation.consignmentQuantity },
        { stockType: "own", quantity: allocation.ownQuantity }
      ].filter((entry) => entry.quantity > 0).forEach((entry) => {
        data.adjustments.push({
          id: crypto.randomUUID(),
          itemId: item.id,
          type: "add",
          stockInSessionId,
          stockType: entry.stockType,
          receivingPurpose,
          quantity: entry.quantity,
          receivedQuantity: quantity,
          balanceBefore,
          balanceAfter,
          remarks: "",
          createdAt: timestamp,
          actorUserId: user.id,
          actorName: user.name
        });
      });
    });

    return { stockInSessionId };
  });
}

async function handleDrawStockAction(user, payload) {
  return mutateState("action:draw-stock", async (data) => {
    const timestamp = new Date().toISOString();
    const projectTitle = toCleanText(payload.projectTitle);
    const receivedBy = toCleanText(payload.receivedBy);
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    if (!projectTitle || !receivedBy) throw new Error("Complete project and receiver details before saving.");
    if (!lines.length) throw new Error("Add at least one stock-out item with a valid quantity.");

    const requestedByItemAndSource = new Map();
    lines.forEach((line) => {
      const issueSource = line.issueSource === "consignment" ? "consignment" : "own";
      const quantity = toNonNegativeInt(line.quantity);
      if (!line.itemId || quantity <= 0) throw new Error("One of the selected stock-out items is invalid.");
      const key = `${line.itemId}|${issueSource}`;
      requestedByItemAndSource.set(key, (requestedByItemAndSource.get(key) ?? 0) + quantity);
    });

    for (const [key, requestedQty] of requestedByItemAndSource.entries()) {
      const [itemId, issueSource] = key.split("|");
      const item = data.inventory.find((record) => record.id === itemId);
      if (!item) throw new Error("One of the selected items could not be found.");
      const availableQuantity = issueSource === "consignment"
        ? Number(item.consignmentQuantity ?? 0)
        : Number(item.ownQuantity ?? item.quantity ?? 0);
      if (requestedQty > availableQuantity) {
        throw new Error(`${item.name} only has ${availableQuantity} ${issueSource === "consignment" ? "consignment" : "LC Stock"} available.`);
      }
    }

    const issuedItems = lines.map((line) => {
      const item = data.inventory.find((record) => record.id === line.itemId);
      const issueSource = line.issueSource === "consignment" ? "consignment" : "own";
      const quantity = toNonNegativeInt(line.quantity);
      const ownBefore = Math.max(Number(item.ownQuantity ?? item.quantity ?? 0), 0);
      const consignmentBefore = Math.max(Number(item.consignmentQuantity ?? 0), 0);
      const balanceBefore = {
        quantity: Number(item.quantity ?? 0),
        ownQuantity: ownBefore,
        consignmentQuantity: consignmentBefore,
        consignmentBaseline: Number(item.consignmentBaseline ?? item.consignmentQuantity ?? 0),
        consignmentToRestock: getConsignmentUsed(item)
      };
      const ownIssued = issueSource === "own" ? quantity : 0;
      const consignmentIssued = issueSource === "consignment" ? quantity : 0;
      item.ownQuantity = ownBefore - ownIssued;
      item.consignmentQuantity = consignmentBefore - consignmentIssued;
      syncInventoryTotals(item);
      item.lastUpdatedAt = timestamp;
      item.lastUpdatedByUserId = user.id;
      item.lastUpdatedByName = user.name;
      const balanceAfter = {
        quantity: Number(item.quantity ?? 0),
        ownQuantity: Number(item.ownQuantity ?? item.quantity ?? 0),
        consignmentQuantity: Number(item.consignmentQuantity ?? 0),
        consignmentBaseline: Number(item.consignmentBaseline ?? item.consignmentQuantity ?? 0),
        consignmentToRestock: getConsignmentUsed(item)
      };

      return {
        itemId: item.id,
        quantity,
        issueSource,
        ownQuantity: ownIssued,
        consignmentQuantity: consignmentIssued,
        balanceBefore,
        balanceAfter,
        ownBalanceAfter: item.ownQuantity,
        consignmentBalanceAfter: item.consignmentQuantity,
        consignmentToRestock: getConsignmentUsed(item),
        itemSnapshot: createItemSnapshot(item)
      };
    });

    const stockOutRecord = {
      id: crypto.randomUUID(),
      documentNo: getNextHandoverDocumentNo(data, timestamp),
      items: issuedItems,
      projectTitle,
      receivedBy,
      createdAt: timestamp,
      createdByUserId: user.id,
      createdByName: user.name
    };

    data.stockOuts.push(stockOutRecord);
    return { stockOutRecord };
  });
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

function getCorrectableRecordKind(record) {
  return record?.type === "correction" ? record.rootSourceType : record?.type;
}

function getActivityRecord(data, type, id) {
  if (type === "create") {
    const item = data.inventory.find((entry) => entry.id === id);
    if (!item) return null;
    return {
      type,
      sourceId: item.id,
      rootSourceType: type,
      rootSourceId: item.id,
      itemRows: [{
        itemId: item.id,
        brand: item.brand ?? "Generic",
        model: item.model ?? "Standard",
        name: item.name ?? "-",
        sku: item.sku ?? "-",
        unit: item.unit ?? "-",
        location: item.location ?? "Main Store",
        ownQuantity: item.ownQuantity ?? item.quantity ?? 0,
        consignmentQuantity: item.consignmentQuantity ?? 0
      }]
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
      }
    }
    if (!adjustments.length) return null;
    return {
      type,
      sourceId: id,
      rootSourceType: type,
      rootSourceId: id,
      itemRows: adjustments.map((adjustment) => {
        const item = data.inventory.find((entry) => entry.id === adjustment.itemId);
        return {
          itemId: adjustment.itemId,
          brand: item?.brand ?? "Generic",
          model: item?.model ?? "Standard",
          name: item?.name ?? "Deleted item",
          sku: item?.sku ?? "-",
          unit: item?.unit ?? "-",
          location: item?.location ?? "Main Store",
          stockType: adjustment.stockType ?? "own",
          quantity: Number(adjustment.quantity ?? 0),
          ownQuantity: adjustment.stockType === "consignment" ? 0 : Number(adjustment.quantity ?? 0),
          consignmentQuantity: adjustment.stockType === "consignment" ? Number(adjustment.quantity ?? 0) : 0
        };
      })
    };
  }

  if (type === "stock-out") {
    const stockOut = data.stockOuts.find((entry) => entry.id === id);
    if (!stockOut) return null;
    return {
      type,
      sourceId: stockOut.id,
      rootSourceType: type,
      rootSourceId: stockOut.id,
      itemRows: (stockOut.items ?? []).map((line) => ({
        itemId: line.itemId,
        brand: line.itemSnapshot?.brand ?? "-",
        model: line.itemSnapshot?.model ?? "-",
        name: line.itemSnapshot?.name ?? "-",
        sku: line.itemSnapshot?.sku ?? "-",
        unit: line.itemSnapshot?.unit ?? "-",
        location: line.itemSnapshot?.location ?? "-",
        quantity: Number(line.quantity ?? 0),
        ownQuantity: Number(line.ownQuantity ?? line.quantity ?? 0),
        consignmentQuantity: Number(line.consignmentQuantity ?? 0)
      }))
    };
  }

  if (type === "correction") {
    const correction = (data.corrections ?? []).find((entry) => entry.id === id);
    if (!correction) return null;
    const rootSource = getRootCorrectionSource(data, correction);
    const sourceKind = getCorrectionSourceKind(correction) ?? rootSource.type ?? correction.sourceType;
    const isCreateCorrection = sourceKind === "create";
    return {
      type,
      sourceType: correction.sourceType,
      sourceId: correction.id,
      rootSourceType: rootSource.type,
      rootSourceId: rootSource.id,
      itemRows: isCreateCorrection
        ? (correction.itemRows ?? [])
        : (correction.itemRows ?? []).map((row) => {
            const correctedOwn = Number(row.correctedValues?.ownQuantity ?? row.ownQuantity ?? 0);
            const correctedConsignment = Number(row.correctedValues?.consignmentQuantity ?? row.consignmentQuantity ?? 0);
            return {
              itemId: row.itemId,
              brand: row.brand ?? "-",
              model: row.model ?? "-",
              name: row.name ?? "-",
              sku: row.sku ?? "-",
              unit: row.unit ?? "-",
              location: row.location ?? "-",
              quantity: row.correctedValues?.quantity ?? row.quantity ?? row.quantityDelta ?? 0,
              stockType: row.correctedValues?.stockType ?? row.stockType ?? "own",
              ownQuantity: correctedOwn,
              consignmentQuantity: correctedConsignment
            };
          })
    };
  }

  return null;
}

function canCorrectActivityKind(correctionKind, user) {
  const role = String(user?.role ?? "").trim().toLowerCase();
  if (role === "administrative") return true;
  if (["create", "stock-in"].includes(correctionKind)) return role === "admin";
  if (correctionKind === "stock-out") return role === "engineer";
  return false;
}

async function handleCorrectActivityAction(user, payload) {
  return mutateState("action:correct-activity", async (data) => {
    const type = toCleanText(payload.type);
    const id = toCleanText(payload.id);
    const reason = toCleanText(payload.reason);
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const record = getActivityRecord(data, type, id);
    const correctionKind = getCorrectableRecordKind(record);

    if (!record || !["create", "stock-in", "stock-out"].includes(correctionKind)) {
      throw new Error("This activity record cannot be corrected.");
    }
    if (!canCorrectActivityKind(correctionKind, user)) {
      throw new Error("You do not have permission to correct this activity record.");
    }
    if (!reason) throw new Error("Enter a correction reason before saving.");
    if (getCorrectionChildren(data, type, id).length) {
      throw new Error("This record already has a correction. Review the correction record before applying another change.");
    }

    const timestamp = new Date().toISOString();
    const correctionRows = [];

    if (correctionKind === "create") {
      const original = record.itemRows[0];
      const item = data.inventory.find((entry) => entry.id === original?.itemId);
      if (!original || !item) throw new Error("The inventory item could not be found.");

      const corrected = rows[0]?.correctedValues ?? rows[0] ?? {};
      const nextValues = {
        brand: toCleanText(corrected.brand),
        model: toCleanText(corrected.model),
        name: toCleanText(corrected.name),
        sku: toCleanText(corrected.sku),
        unit: toCleanText(corrected.unit),
        location: toCleanText(corrected.location)
      };

      if (Object.values(nextValues).some((value) => !value)) {
        throw new Error("Please complete all item information before saving.");
      }

      const previousValues = {
        brand: item.brand ?? "Generic",
        model: item.model ?? "Standard",
        name: item.name ?? "-",
        sku: item.sku ?? "-",
        unit: item.unit ?? "-",
        location: item.location ?? "Main Store"
      };
      const changedFields = Object.keys(nextValues).filter((key) => String(previousValues[key] ?? "") !== String(nextValues[key] ?? ""));
      if (!changedFields.length) throw new Error("No item information changes were entered.");

      Object.assign(item, nextValues, {
        lastUpdatedAt: timestamp,
        lastUpdatedByUserId: user.id,
        lastUpdatedByName: user.name
      });

      correctionRows.push({
        itemId: item.id,
        ...nextValues,
        quantity: 0,
        ownQuantity: item.ownQuantity ?? item.quantity ?? 0,
        consignmentQuantity: item.consignmentQuantity ?? 0,
        previousValues,
        correctedValues: nextValues,
        changedFields
      });
    } else {
      record.itemRows.forEach((original, index) => {
        const item = data.inventory.find((entry) => entry.id === original?.itemId);
        if (!original || !item) throw new Error("One of the correction items could not be found in inventory.");

        const balanceBefore = {
          quantity: Number(item.quantity ?? 0),
          ownQuantity: Number(item.ownQuantity ?? item.quantity ?? 0),
          consignmentQuantity: Number(item.consignmentQuantity ?? 0),
          consignmentBaseline: Number(item.consignmentBaseline ?? item.consignmentQuantity ?? 0),
          consignmentToRestock: getConsignmentUsed(item)
        };

        const corrected = rows[index]?.correctedValues ?? rows[index] ?? {};
        let ownDelta = 0;
        let consignmentDelta = 0;
        let correctedOwnQuantity = 0;
        let correctedConsignmentQuantity = 0;
        let correctedQuantity = 0;
        let correctedStockType = "own";

        if (correctionKind === "stock-in") {
          correctedQuantity = toNonNegativeInt(corrected.quantity);
          correctedStockType = corrected.stockType === "consignment" ? "consignment" : "own";
          correctedOwnQuantity = correctedStockType === "consignment" ? 0 : correctedQuantity;
          correctedConsignmentQuantity = correctedStockType === "consignment" ? correctedQuantity : 0;
          ownDelta = correctedOwnQuantity - Number(original.ownQuantity ?? 0);
          consignmentDelta = correctedConsignmentQuantity - Number(original.consignmentQuantity ?? 0);
        } else {
          correctedOwnQuantity = toNonNegativeInt(corrected.ownQuantity);
          correctedConsignmentQuantity = toNonNegativeInt(corrected.consignmentQuantity);
          ownDelta = Number(original.ownQuantity ?? 0) - correctedOwnQuantity;
          consignmentDelta = Number(original.consignmentQuantity ?? 0) - correctedConsignmentQuantity;
        }

        if (!ownDelta && !consignmentDelta) return;

        const currentOwn = Number(item.ownQuantity ?? item.quantity ?? 0);
        const currentConsignment = Number(item.consignmentQuantity ?? 0);
        if (currentOwn + ownDelta < 0) {
          throw new Error(`This correction cannot be saved because LC Stock would fall below 0 for ${item.name}.`);
        }
        if (currentConsignment + consignmentDelta < 0) {
          throw new Error(`This correction cannot be saved because Consignment Stock would fall below 0 for ${item.name}.`);
        }

        item.ownQuantity = currentOwn + ownDelta;
        item.consignmentQuantity = currentConsignment + consignmentDelta;
        if (correctionKind === "stock-in" && consignmentDelta < 0) {
          item.consignmentBaseline = Math.max(Number(item.consignmentBaseline ?? 0) + consignmentDelta, item.consignmentQuantity, 0);
        } else {
          item.consignmentBaseline = Math.max(Number(item.consignmentBaseline ?? 0), item.consignmentQuantity);
        }
        syncInventoryTotals(item);
        item.lastUpdatedAt = timestamp;
        item.lastUpdatedByUserId = user.id;
        item.lastUpdatedByName = user.name;

        const balanceAfter = {
          quantity: Number(item.quantity ?? 0),
          ownQuantity: Number(item.ownQuantity ?? item.quantity ?? 0),
          consignmentQuantity: Number(item.consignmentQuantity ?? 0),
          consignmentBaseline: Number(item.consignmentBaseline ?? item.consignmentQuantity ?? 0),
          consignmentToRestock: getConsignmentUsed(item)
        };

        correctionRows.push({
          itemId: item.id,
          brand: item.brand ?? "Generic",
          model: item.model ?? "Standard",
          name: item.name,
          sku: item.sku,
          unit: item.unit ?? "-",
          location: item.location ?? "Main Store",
          quantityDelta: ownDelta + consignmentDelta,
          ownDelta,
          consignmentDelta,
          quantity: correctionKind === "stock-in" ? correctedQuantity : ownDelta + consignmentDelta,
          stockType: correctionKind === "stock-in" ? correctedStockType : "own",
          ownQuantity: correctionKind === "stock-out" ? correctedOwnQuantity : correctedOwnQuantity,
          consignmentQuantity: correctionKind === "stock-out" ? correctedConsignmentQuantity : correctedConsignmentQuantity,
          correctedValues: correctionKind === "stock-in"
            ? { quantity: correctedQuantity, stockType: correctedStockType }
            : { ownQuantity: correctedOwnQuantity, consignmentQuantity: correctedConsignmentQuantity },
          balanceBefore,
          balanceAfter
        });
      });
    }

    if (!correctionRows.length) throw new Error("No correction changes were entered.");

    const correction = {
      id: crypto.randomUUID(),
      sourceType: type,
      sourceId: id,
      rootSourceType: record.rootSourceType ?? type,
      rootSourceId: record.rootSourceId ?? id,
      reason,
      itemRows: correctionRows,
      createdAt: timestamp,
      actorUserId: user.id,
      actorName: user.name
    };
    data.corrections = [...(data.corrections ?? []), correction];
    return { correction };
  });
}

async function handleAction(req, res, actionName, user) {
  try {
    const body = await readRequestBody(req);
    const payload = JSON.parse(body || "{}");
    const handlers = {
      "create-stock": handleCreateStockAction,
      "relocate-stock": handleRelocateStockAction,
      "add-stock": handleAddStockAction,
      "draw-stock": handleDrawStockAction,
      "correct-activity": handleCorrectActivityAction
    };
    const handler = handlers[actionName];
    if (!handler) {
      sendJson(res, 404, { ok: false, error: "Action route not found" });
      return;
    }
    sendJson(res, 200, await handler(user, payload));
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
  }
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/health" && req.method === "GET") {
    const databaseResult = await pool.query("SELECT current_database() AS database, current_user AS user");
    sendJson(res, 200, {
      ok: true,
      database: databaseResult.rows[0]?.database,
      user: databaseResult.rows[0]?.user,
      service: "Inventory Management Backend",
      storage: "postgresql"
    });
    return;
  }

  if (pathname === "/api/session" && req.method === "GET") {
    const user = await getSessionUser(req);
    if (!user) {
      sendJson(res, 401, { ok: false, authenticated: false });
      return;
    }
    sendJson(res, 200, { ok: true, authenticated: true, user });
    return;
  }

  if (pathname === "/api/login" && req.method === "POST") {
    try {
      const body = await readRequestBody(req, 1024 * 64);
      const parsed = JSON.parse(body || "{}");
      const username = String(parsed.username || "").trim().toLowerCase();
      const password = String(parsed.password || "");
      const result = await pool.query(
        "SELECT id, username, password_hash, name, role FROM users WHERE lower(username) = $1 AND is_active = true",
        [username]
      );
      const row = result.rows[0];

      if (!row || !verifyPassword(password, row.password_hash)) {
        sendJson(res, 401, { ok: false, error: "Invalid username or password" });
        return;
      }

      await createSession(res, row.id);
      sendJson(res, 200, { ok: true, user: sanitizeUser(row) });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    await destroySession(req, res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/data" && req.method === "GET") {
    const user = await requireSessionUser(req, res);
    if (!user) return;
    sendJson(res, 200, await getState());
    return;
  }

  if (pathname === "/api/data" && ["PUT", "POST"].includes(req.method)) {
    const user = await requireSessionUser(req, res);
    if (!user) return;
    try {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body || "{}");
      sendJson(res, 200, await saveState(parsed.data ?? parsed));
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (pathname.startsWith("/api/actions/") && req.method === "POST") {
    const user = await requireSessionUser(req, res);
    if (!user) return;
    const actionName = pathname.slice("/api/actions/".length);
    await handleAction(req, res, actionName, user);
    return;
  }

  sendJson(res, 404, { ok: false, error: "API route not found" });
}

function serveStatic(req, res, pathname) {
  const relativePath = pathname === "/" ? "inventory.html" : decodeURIComponent(pathname.replace(/^\/+/, ""));
  const filePath = path.resolve(root, relativePath);

  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const extension = path.extname(filePath);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Content-Type", mimeTypes[extension] || "application/octet-stream");
    res.end(data);
  });
}

async function main() {
  await initializeDatabase();

  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);

    if (pathname.startsWith("/api/")) {
      handleApi(req, res, pathname).catch((error) => {
        sendJson(res, 500, { ok: false, error: error.message });
      });
      return;
    }

    serveStatic(req, res, pathname);
  });

  server.listen(port, host, () => {
    console.log(`Inventory app available at http://${host}:${port}`);
    console.log(`Backend API available at http://${host}:${port}/api/health`);
    console.log(`PostgreSQL database: ${process.env.DATABASE_URL || `${process.env.PGHOST || "127.0.0.1"}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || "inventory_management"}`}`);
  });

  async function shutdown() {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Could not start Inventory Management server:", error);
  pool.end().finally(() => process.exit(1));
});
