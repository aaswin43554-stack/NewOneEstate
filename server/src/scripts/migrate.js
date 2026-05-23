/**
 * Runs pending SQL migrations from db/migrations on server startup.
 * Idempotent — skips already-applied migrations. Non-fatal on error.
 */
const fs   = require('fs');
const path = require('path');
const pool = require('../config/db');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../db/migrations');

async function migrate() {
  let client;
  try {
    client = await pool.connect();

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = file.replace('.sql', '');
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1', [version]
      );
      if (rows.length > 0) continue;

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[migrate] applying ${file}`);
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      console.log(`[migrate] done    ${file}`);
    }
    console.log('[migrate] all migrations up to date');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[migrate] FAILED (server will still start):', err.message);
  } finally {
    if (client) client.release();
  }
}

module.exports = migrate;
