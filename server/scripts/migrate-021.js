require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs   = require('fs');
const path = require('path');
const pool = require('../src/config/db');

async function run() {
  const sql = fs.readFileSync(
    path.join(__dirname, '../../db/migrations/021_label_fields.sql'),
    'utf8'
  );
  await pool.query('SET search_path TO ops, public');
  await pool.query(sql);
  console.log('Migration 021 applied.');
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
