// Load .env only if it exists (local dev). On Render, env vars are set directly.
const fs   = require('fs');
const path = require('path');
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn('[migrate] DATABASE_URL not set — skipping migrations.');
  process.exit(0);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  let client;
  try {
    client = await pool.connect();

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = file.replace('.sql', '');
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1', [version]
      );
      if (rows.length > 0) { console.log(`  skip  ${file}`); continue; }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`  apply ${file} ...`);
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      console.log(`  done  ${file}`);
    }

    console.log('\nAll migrations applied successfully.');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('\nMigration failed:', err.message);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

migrate();
