const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const host = process.env.IMS_HOST || "127.0.0.1";
const port = Number(process.env.IMS_PORT || 3000);
const serverRoot = __dirname;
const projectRoot = path.resolve(serverRoot, "..");
const publicRoot = path.join(projectRoot, "public");
const sqliteDatabasePath = process.env.IMS_SQLITE_MIGRATION_PATH || path.join(projectRoot, "data", "inventory.sqlite");

const defaultData = {
  inventory: [],
  adjustments: [],
  stockOuts: [],
  corrections: [],
  relocations: []
};

const sessionCookieName = "ims_session";
const sessionTtlMs = Number(process.env.IMS_SESSION_TTL_HOURS || 12) * 60 * 60 * 1000;
const allowFullDataWrite = process.env.IMS_ALLOW_FULL_DATA_WRITE === "1";
const resetSeededUserPasswords = process.env.IMS_RESET_SEEDED_USER_PASSWORDS === "1";
const allowWeakSeededPasswords = process.env.IMS_ALLOW_WEAK_SEEDED_PASSWORDS === "1";
const productionMode = ["1", "true", "production", "prod"].includes(String(process.env.IMS_PRODUCTION || process.env.NODE_ENV || "").toLowerCase());

function getBuiltInSeedUsers() {
  const password = process.env.IMS_DEFAULT_USER_PASSWORD || "change-this-local-password";
  return [
    { id: "user-fenny", username: "fenny", password, name: "Fenny", role: "Admin" },
    { id: "user-albert", username: "albert", password, name: "Albert", role: "Admin" },
    { id: "user-zin", username: "zin", password, name: "Zin", role: "Engineer" },
    { id: "user-irvyn", username: "irvyn", password, name: "Irvyn", role: "Engineer" },
    { id: "user-johnson", username: "johnson", password, name: "Johnson", role: "Administrative" },
    { id: "user-cindy", username: "cindy", password, name: "Cindy", role: "Administrative" }
  ];
}

function normalizeSeedUser(user, index) {
  return {
    id: String(user.id || `user-${index + 1}`).trim(),
    username: String(user.username || "").trim().toLowerCase(),
    password: String(user.password || ""),
    name: String(user.name || user.username || "").trim(),
    role: String(user.role || "Inventory User").trim()
  };
}

function loadSeedUsers() {
  let seedUsersJson = process.env.IMS_SEED_USERS_JSON;
  if (!seedUsersJson && process.env.IMS_SEED_USERS_FILE) {
    seedUsersJson = fs.readFileSync(path.resolve(projectRoot, process.env.IMS_SEED_USERS_FILE), "utf8");
  }
  if (!seedUsersJson) return getBuiltInSeedUsers();

  const parsed = JSON.parse(seedUsersJson);
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error("IMS_SEED_USERS_JSON must be a non-empty JSON array.");
  }

  const users = parsed.map(normalizeSeedUser);
  const invalidUser = users.find((user) => !user.id || !user.username || !user.password || !user.name || !user.role);
  if (invalidUser) {
    throw new Error("Every seeded user must have id, username, password, name, and role.");
  }

  return users;
}

const seedUsers = loadSeedUsers();

function isWeakSeedPassword(password) {
  const value = String(password || "");
  return value.length < 10 || ["1234", "password", "admin", "change-me", "change-this-local-password"].includes(value.toLowerCase());
}

function validateStartupConfig() {
  if (!productionMode) return;

  if (!process.env.PGPASSWORD && !process.env.DATABASE_URL) {
    throw new Error("Production mode requires PGPASSWORD or DATABASE_URL.");
  }
  if (["change-me", "replace-with-a-strong-password"].includes(String(process.env.PGPASSWORD || "").toLowerCase())) {
    throw new Error("Production mode cannot use a placeholder PostgreSQL password.");
  }
  if (!allowWeakSeededPasswords && seedUsers.some((user) => isWeakSeedPassword(user.password))) {
    throw new Error("Production mode cannot start with weak seeded user passwords. Set strong seeded passwords or set IMS_ALLOW_WEAK_SEEDED_PASSWORDS=1.");
  }
}

validateStartupConfig();

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

function toJsonValue(value, fallback = null) {
  return value === undefined ? fallback : value;
}

function toTimestampValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoValue(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null));
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

    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      name TEXT NOT NULL,
      sku TEXT NOT NULL,
      unit TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      own_quantity INTEGER NOT NULL DEFAULT 0 CHECK (own_quantity >= 0),
      consignment_quantity INTEGER NOT NULL DEFAULT 0 CHECK (consignment_quantity >= 0),
      consignment_baseline INTEGER NOT NULL DEFAULT 0 CHECK (consignment_baseline >= 0),
      stock_condition TEXT NOT NULL DEFAULT 'new',
      reorder_level INTEGER NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
      location TEXT NOT NULL,
      created_at TIMESTAMPTZ,
      last_updated_at TIMESTAMPTZ,
      created_by_user_id TEXT,
      created_by_name TEXT,
      last_updated_by_user_id TEXT,
      last_updated_by_name TEXT
    );

    CREATE INDEX IF NOT EXISTS inventory_items_sku_idx ON inventory_items (lower(sku));
    CREATE INDEX IF NOT EXISTS inventory_items_brand_idx ON inventory_items (brand);
    CREATE INDEX IF NOT EXISTS inventory_items_model_idx ON inventory_items (model);
    CREATE INDEX IF NOT EXISTS inventory_items_location_idx ON inventory_items (location);

    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id TEXT PRIMARY KEY,
      item_id TEXT,
      type TEXT NOT NULL,
      stock_in_session_id TEXT,
      stock_type TEXT,
      receiving_purpose TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      received_quantity INTEGER NOT NULL DEFAULT 0,
      balance_before JSONB,
      balance_after JSONB,
      remarks TEXT,
      created_at TIMESTAMPTZ,
      actor_user_id TEXT,
      actor_name TEXT
    );

    CREATE INDEX IF NOT EXISTS stock_adjustments_item_id_idx ON stock_adjustments (item_id);
    CREATE INDEX IF NOT EXISTS stock_adjustments_created_at_idx ON stock_adjustments (created_at);
    CREATE INDEX IF NOT EXISTS stock_adjustments_session_idx ON stock_adjustments (stock_in_session_id);

    CREATE TABLE IF NOT EXISTS stock_outs (
      id TEXT PRIMARY KEY,
      document_no TEXT NOT NULL UNIQUE,
      project_title TEXT NOT NULL,
      received_by TEXT NOT NULL,
      created_at TIMESTAMPTZ,
      created_by_user_id TEXT,
      created_by_name TEXT
    );

    CREATE INDEX IF NOT EXISTS stock_outs_created_at_idx ON stock_outs (created_at);

    CREATE TABLE IF NOT EXISTS stock_out_items (
      id BIGSERIAL PRIMARY KEY,
      stock_out_id TEXT NOT NULL REFERENCES stock_outs(id) ON DELETE CASCADE,
      item_id TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      issue_source TEXT NOT NULL DEFAULT 'own',
      own_quantity INTEGER NOT NULL DEFAULT 0,
      consignment_quantity INTEGER NOT NULL DEFAULT 0,
      balance_before JSONB,
      balance_after JSONB,
      own_balance_after INTEGER,
      consignment_balance_after INTEGER,
      consignment_to_restock INTEGER,
      item_snapshot JSONB,
      line_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS stock_out_items_stock_out_id_idx ON stock_out_items (stock_out_id);
    CREATE INDEX IF NOT EXISTS stock_out_items_item_id_idx ON stock_out_items (item_id);

    CREATE TABLE IF NOT EXISTS stock_relocations (
      id TEXT PRIMARY KEY,
      item_id TEXT,
      item_snapshot JSONB,
      from_location TEXT NOT NULL,
      to_location TEXT NOT NULL,
      remarks TEXT,
      created_at TIMESTAMPTZ,
      actor_user_id TEXT,
      actor_name TEXT
    );

    CREATE INDEX IF NOT EXISTS stock_relocations_created_at_idx ON stock_relocations (created_at);

    CREATE TABLE IF NOT EXISTS activity_corrections (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      root_source_type TEXT,
      root_source_id TEXT,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ,
      actor_user_id TEXT,
      actor_name TEXT
    );

    CREATE INDEX IF NOT EXISTS activity_corrections_source_idx ON activity_corrections (source_type, source_id);
    CREATE INDEX IF NOT EXISTS activity_corrections_created_at_idx ON activity_corrections (created_at);

    CREATE TABLE IF NOT EXISTS activity_correction_items (
      id BIGSERIAL PRIMARY KEY,
      correction_id TEXT NOT NULL REFERENCES activity_corrections(id) ON DELETE CASCADE,
      item_id TEXT,
      brand TEXT,
      model TEXT,
      name TEXT,
      sku TEXT,
      unit TEXT,
      location TEXT,
      quantity_delta INTEGER,
      own_delta INTEGER,
      consignment_delta INTEGER,
      quantity INTEGER,
      stock_type TEXT,
      own_quantity INTEGER,
      consignment_quantity INTEGER,
      previous_values JSONB,
      corrected_values JSONB,
      changed_fields JSONB,
      balance_before JSONB,
      balance_after JSONB,
      line_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS activity_correction_items_correction_id_idx ON activity_correction_items (correction_id);

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

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_stock_condition_check') THEN
        ALTER TABLE inventory_items
          ADD CONSTRAINT inventory_items_stock_condition_check
          CHECK (stock_condition IN ('new', 'used')) NOT VALID;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_quantity_total_check') THEN
        ALTER TABLE inventory_items
          ADD CONSTRAINT inventory_items_quantity_total_check
          CHECK (quantity = own_quantity + consignment_quantity) NOT VALID;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_adjustments_type_check') THEN
        ALTER TABLE stock_adjustments
          ADD CONSTRAINT stock_adjustments_type_check
          CHECK (type IN ('add', 'remove', 'correction')) NOT VALID;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_adjustments_stock_type_check') THEN
        ALTER TABLE stock_adjustments
          ADD CONSTRAINT stock_adjustments_stock_type_check
          CHECK (stock_type IS NULL OR stock_type IN ('own', 'consignment')) NOT VALID;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_adjustments_receiving_purpose_check') THEN
        ALTER TABLE stock_adjustments
          ADD CONSTRAINT stock_adjustments_receiving_purpose_check
          CHECK (receiving_purpose IS NULL OR receiving_purpose IN ('own', 'consignment')) NOT VALID;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_adjustments_quantity_check') THEN
        ALTER TABLE stock_adjustments
          ADD CONSTRAINT stock_adjustments_quantity_check
          CHECK (quantity >= 0 AND received_quantity >= 0) NOT VALID;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_out_items_issue_source_check') THEN
        ALTER TABLE stock_out_items
          ADD CONSTRAINT stock_out_items_issue_source_check
          CHECK (issue_source IN ('own', 'consignment')) NOT VALID;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_out_items_quantity_check') THEN
        ALTER TABLE stock_out_items
          ADD CONSTRAINT stock_out_items_quantity_check
          CHECK (
            quantity >= 0
            AND own_quantity >= 0
            AND consignment_quantity >= 0
            AND quantity = own_quantity + consignment_quantity
          ) NOT VALID;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_corrections_source_type_check') THEN
        ALTER TABLE activity_corrections
          ADD CONSTRAINT activity_corrections_source_type_check
          CHECK (source_type IN ('create', 'stock-in', 'stock-out', 'correction')) NOT VALID;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_correction_items_stock_type_check') THEN
        ALTER TABLE activity_correction_items
          ADD CONSTRAINT activity_correction_items_stock_type_check
          CHECK (stock_type IS NULL OR stock_type IN ('own', 'consignment')) NOT VALID;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_created_by_user_fk') THEN
        ALTER TABLE inventory_items
          ADD CONSTRAINT inventory_items_created_by_user_fk
          FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_last_updated_by_user_fk') THEN
        ALTER TABLE inventory_items
          ADD CONSTRAINT inventory_items_last_updated_by_user_fk
          FOREIGN KEY (last_updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_adjustments_actor_user_fk') THEN
        ALTER TABLE stock_adjustments
          ADD CONSTRAINT stock_adjustments_actor_user_fk
          FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_outs_created_by_user_fk') THEN
        ALTER TABLE stock_outs
          ADD CONSTRAINT stock_outs_created_by_user_fk
          FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_relocations_actor_user_fk') THEN
        ALTER TABLE stock_relocations
          ADD CONSTRAINT stock_relocations_actor_user_fk
          FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_corrections_actor_user_fk') THEN
        ALTER TABLE activity_corrections
          ADD CONSTRAINT activity_corrections_actor_user_fk
          FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
      END IF;
    END $$;
  `);

  for (const user of seedUsers) {
    await pool.query(
      `
        INSERT INTO users (id, username, password_hash, name, role)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE
          SET username = EXCLUDED.username,
              password_hash = CASE WHEN $6::boolean THEN EXCLUDED.password_hash ELSE users.password_hash END,
              name = EXCLUDED.name,
              role = EXCLUDED.role,
              updated_at = now()
      `,
      [user.id, user.username, createPasswordHash(user.password), user.name, user.role, resetSeededUserPasswords]
    );
  }

  await pool.query("DELETE FROM sessions WHERE expires_at <= now()");

  const relationalCountResult = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM inventory_items)
      + (SELECT COUNT(*) FROM stock_adjustments)
      + (SELECT COUNT(*) FROM stock_outs)
      + (SELECT COUNT(*) FROM stock_relocations)
      + (SELECT COUNT(*) FROM activity_corrections) AS record_count
  `);

  if (Number(relationalCountResult.rows[0]?.record_count ?? 0) === 0) {
    const stateResult = await pool.query("SELECT data_json FROM app_state WHERE id = 1");
    const legacyData = normalizeData(stateResult.rows[0]?.data_json ?? null);
    const sqliteData = readSqliteMigrationData();
    const seedData = hasMeaningfulData(legacyData)
      ? legacyData
      : hasMeaningfulData(sqliteData)
        ? sqliteData
        : defaultData;
    const source = hasMeaningfulData(legacyData)
      ? "jsonb-migration"
      : hasMeaningfulData(sqliteData)
        ? "sqlite-migration"
        : "seed";
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(72252701)");
      await replaceRelationalState(client, seedData);
      await client.query(
        "INSERT INTO app_revisions (data_json, source) VALUES ($1::jsonb, $2)",
        [JSON.stringify(normalizeData(seedData)), source]
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

function normalizeRole(role) {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "administrator" || value === "adminstrator") return "admin";
  if (value === "adminstrative") return "administrative";
  return value;
}

function requireAnyRole(user, allowedRoles, message = "You do not have permission to perform this action.") {
  const role = normalizeRole(user?.role);
  if (!allowedRoles.includes(role)) {
    const error = new Error(message);
    error.statusCode = 403;
    throw error;
  }
}

async function loadStateFromRelational(client = pool) {
  const inventoryResult = await client.query(`
      SELECT *
      FROM inventory_items
      ORDER BY created_at NULLS LAST, name, id
    `);
  const adjustmentsResult = await client.query(`
      SELECT *
      FROM stock_adjustments
      ORDER BY created_at NULLS LAST, id
    `);
  const stockOutResult = await client.query(`
      SELECT *
      FROM stock_outs
      ORDER BY created_at NULLS LAST, id
    `);
  const stockOutItemResult = await client.query(`
      SELECT *
      FROM stock_out_items
      ORDER BY stock_out_id, line_order, id
    `);
  const relocationResult = await client.query(`
      SELECT *
      FROM stock_relocations
      ORDER BY created_at NULLS LAST, id
    `);
  const correctionResult = await client.query(`
      SELECT *
      FROM activity_corrections
      ORDER BY created_at NULLS LAST, id
    `);
  const correctionItemResult = await client.query(`
      SELECT *
      FROM activity_correction_items
      ORDER BY correction_id, line_order, id
    `);

  const stockOutItemsByRecord = stockOutItemResult.rows.reduce((groups, row) => {
    if (!groups.has(row.stock_out_id)) groups.set(row.stock_out_id, []);
    groups.get(row.stock_out_id).push(compactObject({
      itemId: row.item_id,
      quantity: Number(row.quantity ?? 0),
      issueSource: row.issue_source,
      ownQuantity: Number(row.own_quantity ?? 0),
      consignmentQuantity: Number(row.consignment_quantity ?? 0),
      balanceBefore: row.balance_before,
      balanceAfter: row.balance_after,
      ownBalanceAfter: row.own_balance_after === null ? undefined : Number(row.own_balance_after),
      consignmentBalanceAfter: row.consignment_balance_after === null ? undefined : Number(row.consignment_balance_after),
      consignmentToRestock: row.consignment_to_restock === null ? undefined : Number(row.consignment_to_restock),
      itemSnapshot: row.item_snapshot
    }));
    return groups;
  }, new Map());

  const correctionItemsByRecord = correctionItemResult.rows.reduce((groups, row) => {
    if (!groups.has(row.correction_id)) groups.set(row.correction_id, []);
    groups.get(row.correction_id).push(compactObject({
      itemId: row.item_id,
      brand: row.brand,
      model: row.model,
      name: row.name,
      sku: row.sku,
      unit: row.unit,
      location: row.location,
      quantityDelta: row.quantity_delta === null ? undefined : Number(row.quantity_delta),
      ownDelta: row.own_delta === null ? undefined : Number(row.own_delta),
      consignmentDelta: row.consignment_delta === null ? undefined : Number(row.consignment_delta),
      quantity: row.quantity === null ? undefined : Number(row.quantity),
      stockType: row.stock_type,
      ownQuantity: row.own_quantity === null ? undefined : Number(row.own_quantity),
      consignmentQuantity: row.consignment_quantity === null ? undefined : Number(row.consignment_quantity),
      previousValues: row.previous_values,
      correctedValues: row.corrected_values,
      changedFields: row.changed_fields,
      balanceBefore: row.balance_before,
      balanceAfter: row.balance_after
    }));
    return groups;
  }, new Map());

  return normalizeData({
    inventory: inventoryResult.rows.map((row) => ({
      id: row.id,
      brand: row.brand,
      model: row.model,
      name: row.name,
      sku: row.sku,
      unit: row.unit,
      quantity: Number(row.quantity ?? 0),
      ownQuantity: Number(row.own_quantity ?? 0),
      consignmentQuantity: Number(row.consignment_quantity ?? 0),
      consignmentBaseline: Number(row.consignment_baseline ?? 0),
      stockCondition: row.stock_condition,
      reorderLevel: Number(row.reorder_level ?? 0),
      location: row.location,
      createdAt: toIsoValue(row.created_at),
      lastUpdatedAt: toIsoValue(row.last_updated_at),
      createdByUserId: row.created_by_user_id,
      createdByName: row.created_by_name,
      lastUpdatedByUserId: row.last_updated_by_user_id,
      lastUpdatedByName: row.last_updated_by_name
    })),
    adjustments: adjustmentsResult.rows.map((row) => compactObject({
      id: row.id,
      itemId: row.item_id,
      type: row.type,
      stockInSessionId: row.stock_in_session_id,
      stockType: row.stock_type,
      receivingPurpose: row.receiving_purpose,
      quantity: Number(row.quantity ?? 0),
      receivedQuantity: Number(row.received_quantity ?? 0),
      balanceBefore: row.balance_before,
      balanceAfter: row.balance_after,
      remarks: row.remarks,
      createdAt: toIsoValue(row.created_at),
      actorUserId: row.actor_user_id,
      actorName: row.actor_name
    })),
    stockOuts: stockOutResult.rows.map((row) => ({
      id: row.id,
      documentNo: row.document_no,
      items: stockOutItemsByRecord.get(row.id) ?? [],
      projectTitle: row.project_title,
      receivedBy: row.received_by,
      createdAt: toIsoValue(row.created_at),
      createdByUserId: row.created_by_user_id,
      createdByName: row.created_by_name
    })),
    corrections: correctionResult.rows.map((row) => ({
      id: row.id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      rootSourceType: row.root_source_type,
      rootSourceId: row.root_source_id,
      reason: row.reason,
      itemRows: correctionItemsByRecord.get(row.id) ?? [],
      createdAt: toIsoValue(row.created_at),
      actorUserId: row.actor_user_id,
      actorName: row.actor_name
    })),
    relocations: relocationResult.rows.map((row) => compactObject({
      id: row.id,
      itemId: row.item_id,
      itemSnapshot: row.item_snapshot,
      fromLocation: row.from_location,
      toLocation: row.to_location,
      remarks: row.remarks,
      createdAt: toIsoValue(row.created_at),
      actorUserId: row.actor_user_id,
      actorName: row.actor_name
    }))
  });
}

async function replaceRelationalState(client, data) {
  const normalized = normalizeData(data);

  await client.query("DELETE FROM activity_correction_items");
  await client.query("DELETE FROM activity_corrections");
  await client.query("DELETE FROM stock_relocations");
  await client.query("DELETE FROM stock_out_items");
  await client.query("DELETE FROM stock_outs");
  await client.query("DELETE FROM stock_adjustments");
  await client.query("DELETE FROM inventory_items");

  for (const rawItem of normalized.inventory) {
    const item = syncInventoryTotals({ ...rawItem });
    await client.query(
      `
        INSERT INTO inventory_items (
          id, brand, model, name, sku, unit, quantity, own_quantity, consignment_quantity,
          consignment_baseline, stock_condition, reorder_level, location, created_at, last_updated_at,
          created_by_user_id, created_by_name, last_updated_by_user_id, last_updated_by_name
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      `,
      [
        item.id,
        toCleanText(item.brand, "Generic"),
        toCleanText(item.model, "Standard"),
        toCleanText(item.name, "Item"),
        toCleanText(item.sku, item.id),
        toCleanText(item.unit, "unit"),
        Number(item.quantity ?? 0),
        Number(item.ownQuantity ?? 0),
        Number(item.consignmentQuantity ?? 0),
        Number(item.consignmentBaseline ?? item.consignmentQuantity ?? 0),
        normalizeStockCondition(item.stockCondition),
        Number(item.reorderLevel ?? 0),
        toCleanText(item.location, "Main Store"),
        toTimestampValue(item.createdAt),
        toTimestampValue(item.lastUpdatedAt),
        item.createdByUserId ?? null,
        item.createdByName ?? null,
        item.lastUpdatedByUserId ?? null,
        item.lastUpdatedByName ?? null
      ]
    );
  }

  for (const adjustment of normalized.adjustments) {
    await client.query(
      `
        INSERT INTO stock_adjustments (
          id, item_id, type, stock_in_session_id, stock_type, receiving_purpose, quantity,
          received_quantity, balance_before, balance_after, remarks, created_at, actor_user_id, actor_name
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14)
      `,
      [
        adjustment.id,
        adjustment.itemId ?? null,
        adjustment.type ?? "add",
        adjustment.stockInSessionId ?? null,
        adjustment.stockType ?? null,
        adjustment.receivingPurpose ?? null,
        Number(adjustment.quantity ?? 0),
        Number(adjustment.receivedQuantity ?? adjustment.quantity ?? 0),
        JSON.stringify(toJsonValue(adjustment.balanceBefore)),
        JSON.stringify(toJsonValue(adjustment.balanceAfter)),
        adjustment.remarks ?? "",
        toTimestampValue(adjustment.createdAt),
        adjustment.actorUserId ?? null,
        adjustment.actorName ?? null
      ]
    );
  }

  for (const stockOut of normalized.stockOuts) {
    await client.query(
      `
        INSERT INTO stock_outs (id, document_no, project_title, received_by, created_at, created_by_user_id, created_by_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        stockOut.id,
        stockOut.documentNo ?? stockOut.id,
        stockOut.projectTitle ?? "",
        stockOut.receivedBy ?? "",
        toTimestampValue(stockOut.createdAt),
        stockOut.createdByUserId ?? null,
        stockOut.createdByName ?? null
      ]
    );

    for (const [index, line] of (stockOut.items ?? []).entries()) {
      await client.query(
        `
          INSERT INTO stock_out_items (
            stock_out_id, item_id, quantity, issue_source, own_quantity, consignment_quantity,
            balance_before, balance_after, own_balance_after, consignment_balance_after,
            consignment_to_restock, item_snapshot, line_order
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12::jsonb, $13)
        `,
        [
          stockOut.id,
          line.itemId ?? null,
          Number(line.quantity ?? 0),
          line.issueSource === "consignment" ? "consignment" : "own",
          Number(line.ownQuantity ?? (line.issueSource === "consignment" ? 0 : line.quantity ?? 0)),
          Number(line.consignmentQuantity ?? (line.issueSource === "consignment" ? line.quantity ?? 0 : 0)),
          JSON.stringify(toJsonValue(line.balanceBefore)),
          JSON.stringify(toJsonValue(line.balanceAfter)),
          line.ownBalanceAfter ?? null,
          line.consignmentBalanceAfter ?? null,
          line.consignmentToRestock ?? null,
          JSON.stringify(toJsonValue(line.itemSnapshot)),
          index
        ]
      );
    }
  }

  for (const relocation of normalized.relocations) {
    await client.query(
      `
        INSERT INTO stock_relocations (
          id, item_id, item_snapshot, from_location, to_location, remarks, created_at, actor_user_id, actor_name
        )
        VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9)
      `,
      [
        relocation.id,
        relocation.itemId ?? null,
        JSON.stringify(toJsonValue(relocation.itemSnapshot)),
        relocation.fromLocation ?? "",
        relocation.toLocation ?? "",
        relocation.remarks ?? "",
        toTimestampValue(relocation.createdAt),
        relocation.actorUserId ?? null,
        relocation.actorName ?? null
      ]
    );
  }

  for (const correction of normalized.corrections) {
    await client.query(
      `
        INSERT INTO activity_corrections (
          id, source_type, source_id, root_source_type, root_source_id, reason, created_at, actor_user_id, actor_name
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        correction.id,
        correction.sourceType,
        correction.sourceId,
        correction.rootSourceType ?? null,
        correction.rootSourceId ?? null,
        correction.reason ?? "",
        toTimestampValue(correction.createdAt),
        correction.actorUserId ?? null,
        correction.actorName ?? null
      ]
    );

    for (const [index, row] of (correction.itemRows ?? []).entries()) {
      await client.query(
        `
          INSERT INTO activity_correction_items (
            correction_id, item_id, brand, model, name, sku, unit, location, quantity_delta,
            own_delta, consignment_delta, quantity, stock_type, own_quantity, consignment_quantity,
            previous_values, corrected_values, changed_fields, balance_before, balance_after, line_order
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15,
            $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb, $21
          )
        `,
        [
          correction.id,
          row.itemId ?? null,
          row.brand ?? null,
          row.model ?? null,
          row.name ?? null,
          row.sku ?? null,
          row.unit ?? null,
          row.location ?? null,
          row.quantityDelta ?? null,
          row.ownDelta ?? null,
          row.consignmentDelta ?? null,
          row.quantity ?? null,
          row.stockType ?? null,
          row.ownQuantity ?? null,
          row.consignmentQuantity ?? null,
          JSON.stringify(toJsonValue(row.previousValues)),
          JSON.stringify(toJsonValue(row.correctedValues)),
          JSON.stringify(toJsonValue(row.changedFields, [])),
          JSON.stringify(toJsonValue(row.balanceBefore)),
          JSON.stringify(toJsonValue(row.balanceAfter)),
          index
        ]
      );
    }
  }

  return normalized;
}

async function insertInventoryItem(client, rawItem) {
  const item = syncInventoryTotals({ ...rawItem });
  await client.query(
    `
      INSERT INTO inventory_items (
        id, brand, model, name, sku, unit, quantity, own_quantity, consignment_quantity,
        consignment_baseline, stock_condition, reorder_level, location, created_at, last_updated_at,
        created_by_user_id, created_by_name, last_updated_by_user_id, last_updated_by_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    `,
    [
      item.id,
      toCleanText(item.brand, "Generic"),
      toCleanText(item.model, "Standard"),
      toCleanText(item.name, "Item"),
      toCleanText(item.sku, item.id),
      toCleanText(item.unit, "unit"),
      Number(item.quantity ?? 0),
      Number(item.ownQuantity ?? 0),
      Number(item.consignmentQuantity ?? 0),
      Number(item.consignmentBaseline ?? item.consignmentQuantity ?? 0),
      normalizeStockCondition(item.stockCondition),
      Number(item.reorderLevel ?? 0),
      toCleanText(item.location, "Main Store"),
      toTimestampValue(item.createdAt),
      toTimestampValue(item.lastUpdatedAt),
      item.createdByUserId ?? null,
      item.createdByName ?? null,
      item.lastUpdatedByUserId ?? null,
      item.lastUpdatedByName ?? null
    ]
  );
  return item;
}

async function updateInventoryItem(client, rawItem) {
  const item = syncInventoryTotals({ ...rawItem });
  await client.query(
    `
      UPDATE inventory_items
      SET brand = $2,
          model = $3,
          name = $4,
          sku = $5,
          unit = $6,
          quantity = $7,
          own_quantity = $8,
          consignment_quantity = $9,
          consignment_baseline = $10,
          stock_condition = $11,
          reorder_level = $12,
          location = $13,
          created_at = COALESCE($14, created_at),
          last_updated_at = $15,
          created_by_user_id = $16,
          created_by_name = $17,
          last_updated_by_user_id = $18,
          last_updated_by_name = $19
      WHERE id = $1
    `,
    [
      item.id,
      toCleanText(item.brand, "Generic"),
      toCleanText(item.model, "Standard"),
      toCleanText(item.name, "Item"),
      toCleanText(item.sku, item.id),
      toCleanText(item.unit, "unit"),
      Number(item.quantity ?? 0),
      Number(item.ownQuantity ?? 0),
      Number(item.consignmentQuantity ?? 0),
      Number(item.consignmentBaseline ?? item.consignmentQuantity ?? 0),
      normalizeStockCondition(item.stockCondition),
      Number(item.reorderLevel ?? 0),
      toCleanText(item.location, "Main Store"),
      toTimestampValue(item.createdAt),
      toTimestampValue(item.lastUpdatedAt),
      item.createdByUserId ?? null,
      item.createdByName ?? null,
      item.lastUpdatedByUserId ?? null,
      item.lastUpdatedByName ?? null
    ]
  );
  return item;
}

async function insertAdjustment(client, adjustment) {
  await client.query(
    `
      INSERT INTO stock_adjustments (
        id, item_id, type, stock_in_session_id, stock_type, receiving_purpose, quantity,
        received_quantity, balance_before, balance_after, remarks, created_at, actor_user_id, actor_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14)
    `,
    [
      adjustment.id,
      adjustment.itemId ?? null,
      adjustment.type ?? "add",
      adjustment.stockInSessionId ?? null,
      adjustment.stockType ?? null,
      adjustment.receivingPurpose ?? null,
      Number(adjustment.quantity ?? 0),
      Number(adjustment.receivedQuantity ?? adjustment.quantity ?? 0),
      JSON.stringify(toJsonValue(adjustment.balanceBefore)),
      JSON.stringify(toJsonValue(adjustment.balanceAfter)),
      adjustment.remarks ?? "",
      toTimestampValue(adjustment.createdAt),
      adjustment.actorUserId ?? null,
      adjustment.actorName ?? null
    ]
  );
}

async function insertStockOut(client, stockOut) {
  await client.query(
    `
      INSERT INTO stock_outs (id, document_no, project_title, received_by, created_at, created_by_user_id, created_by_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      stockOut.id,
      stockOut.documentNo ?? stockOut.id,
      stockOut.projectTitle ?? "",
      stockOut.receivedBy ?? "",
      toTimestampValue(stockOut.createdAt),
      stockOut.createdByUserId ?? null,
      stockOut.createdByName ?? null
    ]
  );

  for (const [index, line] of (stockOut.items ?? []).entries()) {
    await client.query(
      `
        INSERT INTO stock_out_items (
          stock_out_id, item_id, quantity, issue_source, own_quantity, consignment_quantity,
          balance_before, balance_after, own_balance_after, consignment_balance_after,
          consignment_to_restock, item_snapshot, line_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12::jsonb, $13)
      `,
      [
        stockOut.id,
        line.itemId ?? null,
        Number(line.quantity ?? 0),
        line.issueSource === "consignment" ? "consignment" : "own",
        Number(line.ownQuantity ?? (line.issueSource === "consignment" ? 0 : line.quantity ?? 0)),
        Number(line.consignmentQuantity ?? (line.issueSource === "consignment" ? line.quantity ?? 0 : 0)),
        JSON.stringify(toJsonValue(line.balanceBefore)),
        JSON.stringify(toJsonValue(line.balanceAfter)),
        line.ownBalanceAfter ?? null,
        line.consignmentBalanceAfter ?? null,
        line.consignmentToRestock ?? null,
        JSON.stringify(toJsonValue(line.itemSnapshot)),
        index
      ]
    );
  }
}

async function insertRelocation(client, relocation) {
  await client.query(
    `
      INSERT INTO stock_relocations (
        id, item_id, item_snapshot, from_location, to_location, remarks, created_at, actor_user_id, actor_name
      )
      VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9)
    `,
    [
      relocation.id,
      relocation.itemId ?? null,
      JSON.stringify(toJsonValue(relocation.itemSnapshot)),
      relocation.fromLocation ?? "",
      relocation.toLocation ?? "",
      relocation.remarks ?? "",
      toTimestampValue(relocation.createdAt),
      relocation.actorUserId ?? null,
      relocation.actorName ?? null
    ]
  );
}

async function insertCorrection(client, correction) {
  await client.query(
    `
      INSERT INTO activity_corrections (
        id, source_type, source_id, root_source_type, root_source_id, reason, created_at, actor_user_id, actor_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      correction.id,
      correction.sourceType,
      correction.sourceId,
      correction.rootSourceType ?? null,
      correction.rootSourceId ?? null,
      correction.reason ?? "",
      toTimestampValue(correction.createdAt),
      correction.actorUserId ?? null,
      correction.actorName ?? null
    ]
  );

  for (const [index, row] of (correction.itemRows ?? []).entries()) {
    await client.query(
      `
        INSERT INTO activity_correction_items (
          correction_id, item_id, brand, model, name, sku, unit, location, quantity_delta,
          own_delta, consignment_delta, quantity, stock_type, own_quantity, consignment_quantity,
          previous_values, corrected_values, changed_fields, balance_before, balance_after, line_order
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15,
          $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb, $21
        )
      `,
      [
        correction.id,
        row.itemId ?? null,
        row.brand ?? null,
        row.model ?? null,
        row.name ?? null,
        row.sku ?? null,
        row.unit ?? null,
        row.location ?? null,
        row.quantityDelta ?? null,
        row.ownDelta ?? null,
        row.consignmentDelta ?? null,
        row.quantity ?? null,
        row.stockType ?? null,
        row.ownQuantity ?? null,
        row.consignmentQuantity ?? null,
        JSON.stringify(toJsonValue(row.previousValues)),
        JSON.stringify(toJsonValue(row.correctedValues)),
        JSON.stringify(toJsonValue(row.changedFields, [])),
        JSON.stringify(toJsonValue(row.balanceBefore)),
        JSON.stringify(toJsonValue(row.balanceAfter)),
        index
      ]
    );
  }
}

async function runRelationalAction(source, action) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(72252701)");
    const data = await loadStateFromRelational(client);
    const result = await action(data, client);
    const nextData = await loadStateFromRelational(client);
    await client.query(
      "INSERT INTO app_revisions (data_json, source) VALUES ($1::jsonb, $2)",
      [JSON.stringify(nextData), source]
    );
    await client.query("COMMIT");
    const revisionResult = await pool.query("SELECT COALESCE(MAX(id), 0) AS revision FROM app_revisions");
    return {
      ok: true,
      data: nextData,
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

async function getState() {
  const data = await loadStateFromRelational();
  const updatedResult = await pool.query(`
    SELECT MAX(updated_at) AS updated_at
    FROM (
      SELECT MAX(last_updated_at) AS updated_at FROM inventory_items
      UNION ALL SELECT MAX(created_at) FROM stock_adjustments
      UNION ALL SELECT MAX(created_at) FROM stock_outs
      UNION ALL SELECT MAX(created_at) FROM stock_relocations
      UNION ALL SELECT MAX(created_at) FROM activity_corrections
    ) timestamps
  `);
  const revisionResult = await pool.query("SELECT COALESCE(MAX(id), 0) AS revision FROM app_revisions");
  return {
    data,
    updatedAt: updatedResult.rows[0]?.updated_at,
    revision: Number(revisionResult.rows[0]?.revision ?? 0)
  };
}

async function getLowStockReport() {
  const result = await pool.query(`
    SELECT
      id,
      brand,
      model,
      name,
      sku,
      unit,
      location,
      quantity,
      own_quantity,
      consignment_quantity,
      reorder_level
    FROM inventory_items
    WHERE quantity <= reorder_level
    ORDER BY quantity ASC, name ASC
  `);

  return {
    items: result.rows.map((row) => ({
      id: row.id,
      brand: row.brand,
      model: row.model,
      name: row.name,
      sku: row.sku,
      unit: row.unit,
      location: row.location,
      quantity: Number(row.quantity ?? 0),
      ownQuantity: Number(row.own_quantity ?? 0),
      consignmentQuantity: Number(row.consignment_quantity ?? 0),
      reorderLevel: Number(row.reorder_level ?? 0)
    }))
  };
}

async function getStockByLocationReport() {
  const result = await pool.query(`
    SELECT
      location,
      COUNT(*) AS item_count,
      COALESCE(SUM(quantity), 0) AS total_quantity,
      COALESCE(SUM(own_quantity), 0) AS own_quantity,
      COALESCE(SUM(consignment_quantity), 0) AS consignment_quantity
    FROM inventory_items
    GROUP BY location
    ORDER BY location ASC
  `);

  return {
    locations: result.rows.map((row) => ({
      location: row.location,
      itemCount: Number(row.item_count ?? 0),
      totalQuantity: Number(row.total_quantity ?? 0),
      ownQuantity: Number(row.own_quantity ?? 0),
      consignmentQuantity: Number(row.consignment_quantity ?? 0)
    }))
  };
}

async function getConsignmentRestockReport() {
  const result = await pool.query(`
    SELECT
      id,
      brand,
      model,
      name,
      sku,
      unit,
      location,
      consignment_quantity,
      consignment_baseline,
      GREATEST(consignment_baseline - consignment_quantity, 0) AS restock_quantity
    FROM inventory_items
    WHERE GREATEST(consignment_baseline - consignment_quantity, 0) > 0
    ORDER BY restock_quantity DESC, name ASC
  `);

  return {
    items: result.rows.map((row) => ({
      id: row.id,
      brand: row.brand,
      model: row.model,
      name: row.name,
      sku: row.sku,
      unit: row.unit,
      location: row.location,
      consignmentQuantity: Number(row.consignment_quantity ?? 0),
      consignmentBaseline: Number(row.consignment_baseline ?? 0),
      restockQuantity: Number(row.restock_quantity ?? 0)
    }))
  };
}

async function getMonthlyStockOutReport() {
  const result = await pool.query(`
    SELECT
      date_trunc('month', so.created_at)::date AS month,
      COALESCE(SUM(soi.quantity), 0) AS total_quantity,
      COALESCE(SUM(soi.own_quantity), 0) AS own_quantity,
      COALESCE(SUM(soi.consignment_quantity), 0) AS consignment_quantity,
      COUNT(DISTINCT so.id) AS stock_out_count
    FROM stock_outs so
    JOIN stock_out_items soi ON soi.stock_out_id = so.id
    GROUP BY date_trunc('month', so.created_at)::date
    ORDER BY month DESC
  `);

  return {
    months: result.rows.map((row) => ({
      month: toIsoValue(row.month)?.slice(0, 10) ?? null,
      totalQuantity: Number(row.total_quantity ?? 0),
      ownQuantity: Number(row.own_quantity ?? 0),
      consignmentQuantity: Number(row.consignment_quantity ?? 0),
      stockOutCount: Number(row.stock_out_count ?? 0)
    }))
  };
}

async function getRecentMovementReport(limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const result = await pool.query(`
    SELECT *
    FROM (
      SELECT
        'stock-in' AS type,
        sa.id,
        sa.created_at,
        sa.actor_name,
        i.name AS item_name,
        i.sku,
        sa.quantity AS quantity,
        sa.stock_type AS stock_type,
        NULL::text AS document_no,
        NULL::text AS project_title
      FROM stock_adjustments sa
      LEFT JOIN inventory_items i ON i.id = sa.item_id

      UNION ALL

      SELECT
        'stock-out' AS type,
        so.id,
        so.created_at,
        so.created_by_name AS actor_name,
        COALESCE(soi.item_snapshot->>'name', i.name) AS item_name,
        COALESCE(soi.item_snapshot->>'sku', i.sku) AS sku,
        soi.quantity AS quantity,
        soi.issue_source AS stock_type,
        so.document_no,
        so.project_title
      FROM stock_outs so
      JOIN stock_out_items soi ON soi.stock_out_id = so.id
      LEFT JOIN inventory_items i ON i.id = soi.item_id

      UNION ALL

      SELECT
        'relocate' AS type,
        sr.id,
        sr.created_at,
        sr.actor_name,
        COALESCE(sr.item_snapshot->>'name', i.name) AS item_name,
        COALESCE(sr.item_snapshot->>'sku', i.sku) AS sku,
        0 AS quantity,
        NULL::text AS stock_type,
        NULL::text AS document_no,
        CONCAT(sr.from_location, ' -> ', sr.to_location) AS project_title
      FROM stock_relocations sr
      LEFT JOIN inventory_items i ON i.id = sr.item_id
    ) movements
    ORDER BY created_at DESC NULLS LAST
    LIMIT $1
  `, [safeLimit]);

  return {
    movements: result.rows.map((row) => ({
      type: row.type,
      id: row.id,
      createdAt: toIsoValue(row.created_at),
      actorName: row.actor_name,
      itemName: row.item_name,
      sku: row.sku,
      quantity: Number(row.quantity ?? 0),
      stockType: row.stock_type,
      documentNo: row.document_no,
      projectTitle: row.project_title
    }))
  };
}

async function getReport(pathname, searchParams) {
  const reportName = pathname.slice("/api/reports/".length);
  const handlers = {
    "low-stock": getLowStockReport,
    "stock-by-location": getStockByLocationReport,
    "consignment-restock": getConsignmentRestockReport,
    "monthly-stock-out": getMonthlyStockOutReport,
    "recent-movements": () => getRecentMovementReport(searchParams.get("limit"))
  };
  const handler = handlers[reportName];
  if (!handler) return null;
  return {
    ok: true,
    report: reportName,
    generatedAt: new Date().toISOString(),
    ...(await handler())
  };
}

async function saveState(data) {
  const normalized = normalizeData(data);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(72252701)");
    await replaceRelationalState(client, normalized);
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

async function handleCreateStockAction(user, payload) {
  requireAnyRole(user, ["admin", "administrative"], "Only Admin or Administrative users can create new stock.");
  return runRelationalAction("action:create-stock", async (data, client) => {
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
    await insertInventoryItem(client, item);
    return { item };
  });
}

async function handleRelocateStockAction(user, payload) {
  requireAnyRole(user, ["admin"], "Only Admin users can relocate stock.");
  return runRelationalAction("action:relocate-stock", async (data, client) => {
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
    await updateInventoryItem(client, item);
    await insertRelocation(client, relocation);
    return { relocation };
  });
}

async function handleAddStockAction(user, payload) {
  requireAnyRole(user, ["admin", "administrative"], "Only Admin or Administrative users can add stock.");
  return runRelationalAction("action:add-stock", async (data, client) => {
    const timestamp = new Date().toISOString();
    const stockInSessionId = crypto.randomUUID();
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    if (!lines.length) throw new Error("Add at least one stock item with a valid quantity.");

    for (const line of lines) {
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

      await updateInventoryItem(client, item);

      for (const entry of [
        { stockType: "consignment", quantity: allocation.consignmentQuantity },
        { stockType: "own", quantity: allocation.ownQuantity }
      ].filter((entry) => entry.quantity > 0)) {
        await insertAdjustment(client, {
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
      }
    }

    return { stockInSessionId };
  });
}

async function handleDrawStockAction(user, payload) {
  requireAnyRole(user, ["engineer", "administrative"], "Only Engineer or Administrative users can draw stock.");
  return runRelationalAction("action:draw-stock", async (data, client) => {
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

    for (const line of issuedItems) {
      const item = data.inventory.find((record) => record.id === line.itemId);
      await updateInventoryItem(client, item);
    }

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

    await insertStockOut(client, stockOutRecord);
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
  const role = normalizeRole(user?.role);
  if (role === "administrative") return true;
  if (["create", "stock-in"].includes(correctionKind)) return role === "admin";
  if (correctionKind === "stock-out") return role === "engineer";
  return false;
}

async function handleCorrectActivityAction(user, payload) {
  return runRelationalAction("action:correct-activity", async (data, client) => {
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
      await updateInventoryItem(client, item);

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
      for (const [index, original] of record.itemRows.entries()) {
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
        await updateInventoryItem(client, item);

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
      }
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
    await insertCorrection(client, correction);
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
    sendJson(res, error.statusCode || 400, { ok: false, error: error.message });
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
      storage: "postgresql-relational"
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

  if (pathname.startsWith("/api/reports/") && req.method === "GET") {
    const user = await requireSessionUser(req, res);
    if (!user) return;
    const { searchParams } = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
    const report = await getReport(pathname, searchParams);
    if (!report) {
      sendJson(res, 404, { ok: false, error: "Report route not found" });
      return;
    }
    sendJson(res, 200, report);
    return;
  }

  if (pathname === "/api/data" && ["PUT", "POST"].includes(req.method)) {
    const user = await requireSessionUser(req, res);
    if (!user) return;
    if (!allowFullDataWrite) {
      sendJson(res, 405, {
        ok: false,
        error: "Full data writes are disabled. Use backend action endpoints instead."
      });
      return;
    }
    try {
      requireAnyRole(user, ["admin"], "Only Admin users can run the emergency full data write.");
    } catch (error) {
      sendJson(res, error.statusCode || 403, { ok: false, error: error.message });
      return;
    }
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
  const filePath = path.resolve(publicRoot, relativePath);

  if (!filePath.startsWith(publicRoot + path.sep) && filePath !== publicRoot) {
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
