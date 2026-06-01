/**
 * Idempotent seed — runs on every server start.
 * Creates the demo tenant + admin user if they don't exist yet.
 */
const bcrypt = require('bcryptjs');
const pool   = require('../config/db');

const DEMO_EMAIL    = 'admin@oneestate.com';
const DEMO_PASSWORD = 'Admin123!';
const DEMO_NAME     = 'Admin';
const TENANT_NAME   = 'One Estate Coffee';
const TENANT_SLUG   = 'one-estate';

async function seed() {
  let client;
  try {
    client = await pool.connect();

    const { rows: existing } = await client.query(
      'SELECT id FROM oec_users WHERE email = $1',
      [DEMO_EMAIL]
    );
    if (existing.length > 0) {
      const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
      await client.query(
        'UPDATE oec_users SET password_hash = $1 WHERE email = $2',
        [hash, DEMO_EMAIL]
      );
      console.log('[seed] Demo account password re-synced.');
      return;
    }

    await client.query('BEGIN');

    let tenantId;
    const { rows: tenants } = await client.query(
      'SELECT id FROM oec_tenants WHERE slug = $1', [TENANT_SLUG]
    );
    if (tenants.length > 0) {
      tenantId = tenants[0].id;
    } else {
      const { rows: [t] } = await client.query(
        'INSERT INTO oec_tenants (name, slug) VALUES ($1, $2) RETURNING id',
        [TENANT_NAME, TENANT_SLUG]
      );
      tenantId = t.id;
    }

    const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const { rows: [user] } = await client.query(
      `INSERT INTO oec_users (tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'admin') RETURNING id`,
      [tenantId, DEMO_NAME, DEMO_EMAIL, hash]
    );
    await client.query(
      'UPDATE oec_users SET created_by = $1, updated_by = $1 WHERE id = $1',
      [user.id]
    );

    await client.query('COMMIT');
    console.log('[seed] Demo account created: admin@oneestate.com / Admin123!');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[seed] Seed failed (non-fatal):', err.message);
  } finally {
    if (client) client.release();
  }
}

module.exports = seed;
