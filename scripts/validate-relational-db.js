const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "inventory_management",
  user: process.env.PGUSER || "inventory_app",
  password: process.env.PGPASSWORD || "change-me",
  max: 2,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000
});

const expectedTables = [
  "inventory_items",
  "stock_adjustments",
  "stock_outs",
  "stock_out_items",
  "stock_relocations",
  "activity_corrections",
  "activity_correction_items",
  "users",
  "sessions",
  "app_state",
  "app_revisions"
];

function normalizeCount(value) {
  return Number(value ?? 0);
}

function printSection(title) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

async function tableExists(client, tableName) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS exists
    `,
    [tableName]
  );
  return Boolean(result.rows[0]?.exists);
}

async function getTableCounts(client) {
  const counts = {};
  for (const table of expectedTables) {
    if (!(await tableExists(client, table))) {
      counts[table] = null;
      continue;
    }
    const result = await client.query(`SELECT COUNT(*) AS count FROM ${table}`);
    counts[table] = normalizeCount(result.rows[0]?.count);
  }
  return counts;
}

async function getLegacyJsonCounts(client) {
  if (!(await tableExists(client, "app_state"))) return null;

  const result = await client.query("SELECT data_json FROM app_state WHERE id = 1");
  const data = result.rows[0]?.data_json;
  if (!data) return null;

  return {
    inventory: Array.isArray(data.inventory) ? data.inventory.length : 0,
    adjustments: Array.isArray(data.adjustments) ? data.adjustments.length : 0,
    stockOuts: Array.isArray(data.stockOuts) ? data.stockOuts.length : 0,
    stockOutItems: Array.isArray(data.stockOuts)
      ? data.stockOuts.reduce((sum, record) => sum + (Array.isArray(record.items) ? record.items.length : 0), 0)
      : 0,
    corrections: Array.isArray(data.corrections) ? data.corrections.length : 0,
    correctionItems: Array.isArray(data.corrections)
      ? data.corrections.reduce((sum, record) => sum + (Array.isArray(record.itemRows) ? record.itemRows.length : 0), 0)
      : 0,
    relocations: Array.isArray(data.relocations) ? data.relocations.length : 0
  };
}

async function getAnomalies(client) {
  const checks = [
    {
      name: "inventory_quantity_mismatch",
      sql: `
        SELECT id, sku, name, quantity, own_quantity, consignment_quantity
        FROM inventory_items
        WHERE quantity <> own_quantity + consignment_quantity
        ORDER BY name ASC
      `
    },
    {
      name: "invalid_stock_condition",
      sql: `
        SELECT id, sku, name, stock_condition
        FROM inventory_items
        WHERE stock_condition NOT IN ('new', 'used')
        ORDER BY name ASC
      `
    },
    {
      name: "invalid_stock_adjustment_values",
      sql: `
        SELECT id, type, stock_type, receiving_purpose, quantity, received_quantity
        FROM stock_adjustments
        WHERE type NOT IN ('add', 'remove', 'correction')
           OR (stock_type IS NOT NULL AND stock_type NOT IN ('own', 'consignment'))
           OR (receiving_purpose IS NOT NULL AND receiving_purpose NOT IN ('own', 'consignment'))
           OR quantity < 0
           OR received_quantity < 0
        ORDER BY created_at DESC NULLS LAST
      `
    },
    {
      name: "invalid_stock_out_line_values",
      sql: `
        SELECT id, stock_out_id, quantity, own_quantity, consignment_quantity, issue_source
        FROM stock_out_items
        WHERE issue_source NOT IN ('own', 'consignment')
           OR quantity < 0
           OR own_quantity < 0
           OR consignment_quantity < 0
           OR quantity <> own_quantity + consignment_quantity
        ORDER BY id ASC
      `
    },
    {
      name: "missing_stock_out_lines",
      sql: `
        SELECT so.id, so.document_no
        FROM stock_outs so
        LEFT JOIN stock_out_items soi ON soi.stock_out_id = so.id
        GROUP BY so.id, so.document_no
        HAVING COUNT(soi.id) = 0
        ORDER BY so.document_no ASC
      `
    },
    {
      name: "missing_correction_lines",
      sql: `
        SELECT ac.id, ac.source_type, ac.source_id
        FROM activity_corrections ac
        LEFT JOIN activity_correction_items aci ON aci.correction_id = ac.id
        GROUP BY ac.id, ac.source_type, ac.source_id
        HAVING COUNT(aci.id) = 0
        ORDER BY ac.created_at DESC NULLS LAST
      `
    }
  ];

  const anomalies = {};
  for (const check of checks) {
    const result = await client.query(check.sql);
    anomalies[check.name] = result.rows;
  }
  return anomalies;
}

function compareLegacyCounts(legacyCounts, tableCounts) {
  if (!legacyCounts) return [];

  const comparisons = [
    ["inventory", "inventory_items"],
    ["adjustments", "stock_adjustments"],
    ["stockOuts", "stock_outs"],
    ["stockOutItems", "stock_out_items"],
    ["corrections", "activity_corrections"],
    ["correctionItems", "activity_correction_items"],
    ["relocations", "stock_relocations"]
  ];

  return comparisons
    .map(([legacyKey, tableKey]) => ({
      legacyKey,
      tableKey,
      legacyCount: legacyCounts[legacyKey],
      tableCount: tableCounts[tableKey]
    }))
    .filter((comparison) => comparison.legacyCount !== comparison.tableCount);
}

async function main() {
  const client = await pool.connect();
  let failed = false;

  try {
    const databaseResult = await client.query("SELECT current_database() AS database, current_user AS user");
    printSection("Connection");
    console.log(`Database: ${databaseResult.rows[0]?.database}`);
    console.log(`User: ${databaseResult.rows[0]?.user}`);

    const tableCounts = await getTableCounts(client);
    printSection("Table Counts");
    for (const [table, count] of Object.entries(tableCounts)) {
      if (count === null) {
        failed = true;
        console.log(`${table}: MISSING`);
      } else {
        console.log(`${table}: ${count}`);
      }
    }

    const legacyCounts = await getLegacyJsonCounts(client);
    const mismatches = compareLegacyCounts(legacyCounts, tableCounts);
    printSection("Legacy JSON Comparison");
    if (!legacyCounts) {
      console.log("No app_state JSON row found to compare.");
    } else if (!mismatches.length) {
      console.log("Relational counts match app_state JSON counts.");
    } else {
      failed = true;
      mismatches.forEach((mismatch) => {
        console.log(`${mismatch.legacyKey} -> ${mismatch.tableKey}: JSON=${mismatch.legacyCount}, relational=${mismatch.tableCount}`);
      });
    }

    const anomalies = await getAnomalies(client);
    printSection("Data Anomalies");
    for (const [name, rows] of Object.entries(anomalies)) {
      if (!rows.length) {
        console.log(`${name}: ok`);
        continue;
      }
      failed = true;
      console.log(`${name}: ${rows.length} issue(s)`);
      rows.slice(0, 10).forEach((row) => console.log(`  ${JSON.stringify(row)}`));
      if (rows.length > 10) console.log(`  ...${rows.length - 10} more`);
    }

    printSection("Result");
    if (failed) {
      console.log("Validation failed. Review the issues above before go-live.");
      process.exitCode = 1;
    } else {
      console.log("Validation passed.");
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
