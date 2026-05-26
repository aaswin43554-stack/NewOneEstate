const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('[DB][DB_001] DATABASE_URL is not set — all queries will fail');
}

// Append search_path as a connection parameter so it is set at the protocol level
// on every new connection — no extra round-trip query needed.
function buildConnectionString(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('options', '-c search_path=ops,public');
    return u.toString();
  } catch {
    // Fallback for non-URL connection strings
    return url + (url.includes('?') ? '&' : '?') + 'options=-c%20search_path%3Dops%2Cpublic';
  }
}

const pool = new Pool({
  connectionString: buildConnectionString(process.env.DATABASE_URL),
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('connect', () => {
  console.log(`[DB] New connection established (pool size: ${pool.totalCount})`);
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
