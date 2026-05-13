const crypto = require("crypto");
const { Pool } = require("pg");

const updates = [
  ["albert", process.env.IMS_PW_ALBERT],
  ["johnson", process.env.IMS_PW_JOHNSON],
  ["zin", process.env.IMS_PW_ZIN],
  ["cindy", process.env.IMS_PW_CINDY],
  ["irvyn", process.env.IMS_PW_IRVYN]
].filter(([, password]) => password);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "inventory_management",
  user: process.env.PGUSER || "inventory_app",
  password: process.env.PGPASSWORD
});

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const iterations = 210000;
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

async function main() {
  if (!updates.length) {
    throw new Error("No password environment variables were provided.");
  }

  for (const [username, password] of updates) {
    const result = await pool.query(
      "UPDATE users SET password_hash = $1, updated_at = now() WHERE lower(username) = $2",
      [createPasswordHash(password), username]
    );
    if (result.rowCount !== 1) {
      throw new Error(`User not found: ${username}`);
    }
  }

  console.log(`Updated ${updates.length} user password${updates.length === 1 ? "" : "s"}.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
