const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Pre-computed at boot. When a login email is unknown we still run a bcrypt
// comparison against this hash so the response takes ~the same time as a real
// (but wrong) password — defeats user-enumeration via timing side-channel.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('unused-placeholder-password', 12);

function makeAccessToken(user) {
  if (!process.env.JWT_SECRET) {
    console.error('[AUTH][TOKEN_001] JWT_SECRET not set — cannot sign access token');
    throw new Error('JWT_SECRET not configured');
  }
  const expires = process.env.JWT_ACCESS_EXPIRES || '15m';
  console.log(`[AUTH] Signing access token for user ${user.id} (${user.email}) | expires: ${expires}`);
  return jwt.sign(
    { id: user.id, tenant_id: user.tenant_id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: expires }
  );
}

function makeRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function storeRefreshToken(userId, raw) {
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  console.log(`[AUTH] Storing refresh token for user ${userId} | expires: ${expiresAt.toISOString()}`);
  try {
    await pool.query(
      'INSERT INTO oec_refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, hashToken(raw), expiresAt]
    );
    console.log(`[AUTH] Refresh token stored OK for user ${userId}`);
  } catch (err) {
    // TOKEN_002: DB insert for refresh token failed — user will be logged in but refresh won't work
    console.error(`[AUTH][TOKEN_002] Failed to store refresh token for user ${userId} | pg code: ${err.code} | ${err.message}`);
    throw err;
  }
}

// POST /api/auth/register
// Creates a new tenant + admin user in one transaction.
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('tenant_name').trim().notEmpty().withMessage('Tenant name is required'),
    body('tenant_slug')
      .trim()
      .matches(/^[a-z0-9-]+$/)
      .withMessage('Slug must be lowercase alphanumeric with hyphens only'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // REG_001: Request body failed validation
      console.warn(`[REGISTER][REG_001] Validation failed | errors: ${JSON.stringify(errors.array())}`);
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, tenant_name, tenant_slug } = req.body;
    console.log(`[REGISTER] Attempt — email: ${email} | tenant_slug: ${tenant_slug}`);

    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      // REG_DB_001: Could not acquire a DB connection from the pool
      console.error(`[REGISTER][REG_DB_001] DB connection pool exhausted or timeout | ${err.message}`);
      return res.status(500).json({ error: 'Database unavailable', code: 'REG_DB_001' });
    }

    try {
      await client.query('BEGIN');
      console.log(`[REGISTER] Transaction started for tenant_slug: ${tenant_slug}`);

      const slugTaken = await client.query('SELECT 1 FROM oec_tenants WHERE slug = $1', [tenant_slug]);
      if (slugTaken.rows.length) {
        await client.query('ROLLBACK');
        // REG_002: Tenant slug already in use
        console.warn(`[REGISTER][REG_002] Tenant slug already taken: "${tenant_slug}"`);
        return res.status(409).json({ error: 'Tenant slug already taken', code: 'REG_002' });
      }

      const { rows: [tenant] } = await client.query(
        'INSERT INTO oec_tenants (name, slug) VALUES ($1, $2) RETURNING id',
        [tenant_name, tenant_slug]
      );
      console.log(`[REGISTER] Tenant created — id: ${tenant.id} | slug: ${tenant_slug}`);

      const emailTaken = await client.query(
        'SELECT 1 FROM oec_users WHERE tenant_id = $1 AND email = $2',
        [tenant.id, email]
      );
      if (emailTaken.rows.length) {
        await client.query('ROLLBACK');
        // REG_003: Email already registered within this tenant
        console.warn(`[REGISTER][REG_003] Email already registered: ${email} | tenant: ${tenant.id}`);
        return res.status(409).json({ error: 'Email already registered', code: 'REG_003' });
      }

      console.log(`[REGISTER] Hashing password for ${email}`);
      const passwordHash = await bcrypt.hash(password, 12);

      const { rows: [user] } = await client.query(
        `INSERT INTO oec_users (tenant_id, name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, 'admin')
         RETURNING id, tenant_id, name, email, role, timezone`,
        [tenant.id, name, email, passwordHash]
      );
      console.log(`[REGISTER] User created — id: ${user.id} | email: ${user.email} | role: ${user.role}`);

      // First user bootstraps their own audit fields
      await client.query(
        'UPDATE oec_users SET created_by = $1, updated_by = $1 WHERE id = $1',
        [user.id]
      );

      await client.query('COMMIT');
      console.log(`[REGISTER] Transaction committed for user ${user.id}`);

      const refreshRaw = makeRefreshToken();
      await storeRefreshToken(user.id, refreshRaw);

      console.log(`[REGISTER] SUCCESS — user ${user.id} (${user.email}) registered`);
      return res.status(201).json({
        access_token: makeAccessToken(user),
        refresh_token: refreshRaw,
        user: { id: user.id, tenant_id: user.tenant_id, name: user.name, email: user.email, role: user.role, timezone: user.timezone },
      });
    } catch (err) {
      await client.query('ROLLBACK').catch((rbErr) => {
        console.error(`[REGISTER] Rollback also failed: ${rbErr.message}`);
      });
      // REG_004: Unexpected DB or server error during registration transaction
      console.error(`[REGISTER][REG_004] Registration failed for email: ${email}`);
      console.error(`[REGISTER][REG_004] pg code: ${err.code || 'N/A'} | message: ${err.message}`);
      console.error(err.stack);
      return res.status(500).json({ error: 'Registration failed', code: 'REG_004' });
    } finally {
      client.release();
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // LOGIN_001: Request body failed validation (bad email format or missing password)
      console.warn(`[LOGIN][LOGIN_001] Validation failed | errors: ${JSON.stringify(errors.array())}`);
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    console.log(`[LOGIN] Attempt — email: ${email} | DB URL set: ${!!process.env.DATABASE_URL} | JWT_SECRET set: ${!!process.env.JWT_SECRET}`);

    try {
      console.log(`[LOGIN] Querying user record for: ${email}`);
      const { rows } = await pool.query(
        `SELECT id, tenant_id, name, email, password_hash, role, timezone
         FROM oec_users WHERE email = $1`,
        [email]
      );

      if (!rows.length) {
        // LOGIN_002: No user found with that email. Run a dummy compare so the
        // response timing matches the wrong-password path, and return the SAME
        // error code so the API can't be used to enumerate valid emails.
        await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
        console.warn(`[LOGIN][LOGIN_002] No user found for email: ${email}`);
        return res.status(401).json({ error: 'Invalid credentials', code: 'LOGIN_002' });
      }

      const user = rows[0];
      console.log(`[LOGIN] User found — id: ${user.id} | role: ${user.role} | tenant: ${user.tenant_id} — comparing password`);

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        // LOGIN_003 (internal log only): password mismatch. The client-facing
        // code is kept identical to LOGIN_002 above to prevent enumeration.
        console.warn(`[LOGIN][LOGIN_003] Password mismatch for user ${user.id} (${email})`);
        return res.status(401).json({ error: 'Invalid credentials', code: 'LOGIN_002' });
      }

      console.log(`[LOGIN] Password OK for user ${user.id} — generating tokens`);
      const refreshRaw = makeRefreshToken();
      await storeRefreshToken(user.id, refreshRaw);

      console.log(`[LOGIN] SUCCESS — user ${user.id} (${email}) logged in`);
      return res.json({
        access_token: makeAccessToken(user),
        refresh_token: refreshRaw,
        user: { id: user.id, tenant_id: user.tenant_id, name: user.name, email: user.email, role: user.role, timezone: user.timezone },
      });
    } catch (err) {
      // LOGIN_004: Unexpected DB/server error during login
      console.error(`[LOGIN][LOGIN_004] Login failed for email: ${email}`);
      console.error(`[LOGIN][LOGIN_004] pg code: ${err.code || 'N/A'} | message: ${err.message}`);
      console.error(`[LOGIN][LOGIN_004] DATABASE_URL set: ${!!process.env.DATABASE_URL} | JWT_SECRET set: ${!!process.env.JWT_SECRET}`);
      if (err.code === 'ECONNREFUSED') {
        console.error(`[LOGIN][LOGIN_004] DB connection refused — is the database running and reachable?`);
      }
      if (err.code === '57P03') {
        console.error(`[LOGIN][LOGIN_004] DB is starting up (57P03) — retry in a few seconds`);
      }
      if (err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
        console.error(`[LOGIN][LOGIN_004] DB network error (${err.code}) — check DATABASE_URL host`);
      }
      console.error(err.stack);
      return res.status(500).json({ error: 'Login failed', code: 'LOGIN_004' });
    }
  }
);

// POST /api/auth/refresh
router.post(
  '/refresh',
  [body('refresh_token').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // REFRESH_001: Missing refresh_token field in request body
      console.warn(`[REFRESH][REFRESH_001] Validation failed — refresh_token field missing`);
      return res.status(400).json({ errors: errors.array() });
    }

    const tokenHash = hashToken(req.body.refresh_token);
    console.log(`[REFRESH] Token refresh attempt — hash prefix: ${tokenHash.slice(0, 8)}...`);

    try {
      const { rows } = await pool.query(
        `SELECT rt.revoked_at, rt.expires_at,
                u.id, u.tenant_id, u.email, u.role
         FROM oec_refresh_tokens rt
         JOIN oec_users u ON u.id = rt.user_id
         WHERE rt.token_hash = $1`,
        [tokenHash]
      );

      if (!rows.length) {
        // REFRESH_002: Hash not found in DB — token was never issued or already deleted
        console.warn(`[REFRESH][REFRESH_002] Refresh token not found in DB (hash prefix: ${tokenHash.slice(0, 8)})`);
        return res.status(401).json({ error: 'Invalid refresh token', code: 'REFRESH_002' });
      }

      const row = rows[0];

      if (row.revoked_at) {
        // REFRESH_003: Token was explicitly revoked (logout)
        console.warn(`[REFRESH][REFRESH_003] Refresh token revoked for user ${row.id} (${row.email}) | revoked at: ${row.revoked_at}`);
        return res.status(401).json({ error: 'Refresh token revoked', code: 'REFRESH_003' });
      }

      if (new Date(row.expires_at) < new Date()) {
        // REFRESH_004: Token exists and is not revoked but has passed its TTL
        console.warn(`[REFRESH][REFRESH_004] Refresh token expired for user ${row.id} (${row.email}) | expired at: ${row.expires_at}`);
        return res.status(401).json({ error: 'Refresh token expired', code: 'REFRESH_004' });
      }

      console.log(`[REFRESH] SUCCESS — issuing new access token for user ${row.id} (${row.email})`);
      return res.json({ access_token: makeAccessToken(row) });
    } catch (err) {
      // REFRESH_005: Unexpected DB error during token lookup
      console.error(`[REFRESH][REFRESH_005] Token refresh DB error | pg code: ${err.code || 'N/A'} | ${err.message}`);
      console.error(err.stack);
      return res.status(500).json({ error: 'Token refresh failed', code: 'REFRESH_005' });
    }
  }
);

// POST /api/auth/logout
router.post(
  '/logout',
  [body('refresh_token').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // LOGOUT_001: Missing refresh_token — cannot revoke without it
      console.warn(`[LOGOUT][LOGOUT_001] Validation failed — refresh_token field missing`);
      return res.status(400).json({ errors: errors.array() });
    }

    const tokenHash = hashToken(req.body.refresh_token);
    console.log(`[LOGOUT] Revoking refresh token | hash prefix: ${tokenHash.slice(0, 8)}...`);

    try {
      const result = await pool.query(
        'UPDATE oec_refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
        [tokenHash]
      );
      if (result.rowCount === 0) {
        // LOGOUT_002: Token not found or already revoked — treat as success (idempotent logout)
        console.warn(`[LOGOUT][LOGOUT_002] Token not found or already revoked (hash prefix: ${tokenHash.slice(0, 8)}) — still returning 200`);
      } else {
        console.log(`[LOGOUT] SUCCESS — refresh token revoked`);
      }
      return res.json({ message: 'Logged out successfully' });
    } catch (err) {
      // LOGOUT_003: DB error while revoking token
      console.error(`[LOGOUT][LOGOUT_003] Logout DB error | pg code: ${err.code || 'N/A'} | ${err.message}`);
      console.error(err.stack);
      return res.status(500).json({ error: 'Logout failed', code: 'LOGOUT_003' });
    }
  }
);

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  console.log(`[ME] Fetching profile for user ${req.user.id} (${req.user.email})`);
  try {
    const { rows } = await pool.query(
      `SELECT id, tenant_id, name, email, role, timezone, created_at
       FROM oec_users WHERE id = $1`,
      [req.user.id]
    );
    if (!rows.length) {
      // ME_001: JWT is valid but the user row was deleted from DB (orphaned token)
      console.warn(`[ME][ME_001] User ${req.user.id} authenticated via JWT but not found in DB — account may have been deleted`);
      return res.status(404).json({ error: 'User not found', code: 'ME_001' });
    }
    console.log(`[ME] OK — returned profile for user ${rows[0].id} (${rows[0].email})`);
    return res.json({ user: rows[0] });
  } catch (err) {
    // ME_002: DB error fetching user profile
    console.error(`[ME][ME_002] DB error fetching user ${req.user.id} | pg code: ${err.code || 'N/A'} | ${err.message}`);
    console.error(err.stack);
    return res.status(500).json({ error: 'Failed to fetch user', code: 'ME_002' });
  }
});

module.exports = router;
