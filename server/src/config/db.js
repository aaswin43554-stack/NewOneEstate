const { Pool } = require('pg');

// Encode search_path into connection options so it works with both
// session-mode and transaction-mode poolers (Supabase Supavisor).
function buildConnectionString(url) {
  if (!url) return url;
  const u = new URL(url);
  if (!u.searchParams.has('options')) {
    u.searchParams.set('options', '-c search_path=ops,public');
  }
  return u.toString();
}

const pool = new Pool({
  connectionString: buildConnectionString(process.env.DATABASE_URL),
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client:', err.message);
});

module.exports = pool;
