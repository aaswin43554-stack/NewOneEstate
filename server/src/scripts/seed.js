/**
 * Idempotent seed — creates the demo tenant + admin user once, if absent.
 *
 * SECURITY: This must never ship a known-password admin to production. The
 * account is only seeded when NODE_ENV !== 'production', OR when an explicit
 * SEED_ADMIN_PASSWORD is provided (so a prod bootstrap can set a real secret).
 * It also never overwrites the password of an account that already exists —
 * resetting it on every boot would let anyone reclaim the account after the
 * operator changed the password.
 */
const bcrypt = require('bcryptjs');
const pool   = require('../config/db');

const DEMO_EMAIL  = 'admin@oneestate.com';
const DEMO_NAME   = 'Admin';
const TENANT_NAME = 'One Estate Coffee';
const TENANT_SLUG = 'one-estate';

async function seed() {
  const isProd       = process.env.NODE_ENV === 'production';
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;

  // In production, refuse to create a demo admin unless an explicit password
  // was supplied — never auto-provision a publicly-known credential.
  if (isProd && !seedPassword) {
    console.log('[seed] Skipped — production environment without SEED_ADMIN_PASSWORD.');
    return;
  }
  // Dev convenience default; only ever used outside production.
  const password = seedPassword || 'Admin123!';

  let client;
  try {
    client = await pool.connect();

    const { rows: existing } = await client.query(
      'SELECT id FROM oec_users WHERE email = $1',
      [DEMO_EMAIL]
    );
    if (existing.length > 0) {
      // Account already exists — do NOT reset its password on every boot.
      console.log('[seed] Demo account already present — password left unchanged.');
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

    const hash = await bcrypt.hash(password, 12);
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
    console.log('[seed] Demo account created: admin@oneestate.com');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[seed] Seed failed (non-fatal):', err.message);
  } finally {
    if (client) client.release();
  }
}

module.exports = seed;
