const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('[DB][DB_001] DATABASE_URL is not set — all queries will fail');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Set search_path on every new physical connection.
// Fire-and-forget is safe here — pg serialises queries per client,
// so this SET always executes before the first user query on that connection.
pool.on('connect', (client) => {
  console.log(`[DB] New connection established (pool size: ${pool.totalCount})`);
  client.query('SET search_path TO ops, public').catch((err) => {
    console.error(`[DB] Failed to set search_path: ${err.message}`);
  });
});

pool.on('remove', () => {
  console.log(`[DB] Connection removed from pool (remaining: ${pool.totalCount})`);
});

pool.on('error', (err) => {
  // DB_002: unexpected error on an idle client — usually a network drop or server restart
  console.error(`[DB][DB_002] Unexpected error on idle pg client: ${err.message}`);
  console.error(`[DB][DB_002] Code: ${err.code || 'N/A'} | Detail: ${err.detail || 'N/A'}`);
});

module.exports = pool;
