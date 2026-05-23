const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// All ops tables live in the 'ops' schema
pool.on('connect', (client) => {
  client.query('SET search_path TO ops, public');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client:', err.message);
});

module.exports = pool;
