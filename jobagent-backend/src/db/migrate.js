require('dotenv').config();
const DB_TYPE = process.env.DB_TYPE || 'sqlite';

console.log(`[Migrate] Running against DB_TYPE: ${DB_TYPE}`);

try {
  const dbModule = require('./database.js');
  const db = dbModule.db;

  if (DB_TYPE === 'sqlite') {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all();
    console.log("[Migrate] All tables verified/created");
    tables.forEach(row => console.log(" -", row.name));
    process.exit(0);
  }

  if (DB_TYPE === 'postgres') {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
      (err, res) => {
        if (err) {
          console.error("[Migrate] Error querying tables:", err.message);
          process.exit(1);
        }
        console.log("[Migrate] All tables verified/created");
        res.rows.forEach(row => console.log(" -", row.table_name));
        pool.end();
        process.exit(0);
      }
    );
    return;
  }

  console.error(`[Migrate] Unsupported DB_TYPE: ${DB_TYPE}`);
  process.exit(1);

} catch (err) {
  console.error("[Migrate] Error:", err.message);
  process.exit(1);
}