const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function makeAccessToken(user) {
  return jwt.sign(
    { id: user.id, tenant_id: user.tenant_id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' }
  );
}

function makeRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function storeRefreshToken(userId, raw) {
  await pool.query(
    'INSERT INTO oec_refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hashToken(raw), new Date(Date.now() + REFRESH_TTL_MS)]
  );
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
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, password, tenant_name, tenant_slug } = req.body;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const slugTaken = await client.query('SELECT 1 FROM oec_tenants WHERE slug = $1', [tenant_slug]);
      if (slugTaken.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Tenant slug already taken' });
      }

      const { rows: [tenant] } = await client.query(
        'INSERT INTO oec_tenants (name, slug) VALUES ($1, $2) RETURNING id',
        [tenant_name, tenant_slug]
      );

      const emailTaken = await client.query(
        'SELECT 1 FROM oec_users WHERE tenant_id = $1 AND email = $2',
        [tenant.id, email]
      );
      if (emailTaken.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const { rows: [user] } = await client.query(
        `INSERT INTO oec_users (tenant_id, name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, 'admin')
         RETURNING id, tenant_id, name, email, role, timezone`,
        [tenant.id, name, email, passwordHash]
      );

      // First user bootstraps their own audit fields
      await client.query(
        'UPDATE oec_users SET created_by = $1, updated_by = $1 WHERE id = $1',
        [user.id]
      );

      await client.query('COMMIT');

      const refreshRaw = makeRefreshToken();
      await storeRefreshToken(user.id, refreshRaw);

      return res.status(201).json({
        access_token: makeAccessToken(user),
        refresh_token: refreshRaw,
        user: { id: user.id, tenant_id: user.tenant_id, name: user.name, email: user.email, role: user.role, timezone: user.timezone },
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Register error:', err);
      return res.status(500).json({ error: 'Registration failed' });
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
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    try {
      const { rows } = await pool.query(
        `SELECT id, tenant_id, name, email, password_hash, role, timezone
         FROM oec_users WHERE email = $1`,
        [email]
      );

      if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

      const user = rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

      const refreshRaw = makeRefreshToken();
      await storeRefreshToken(user.id, refreshRaw);

      return res.json({
        access_token: makeAccessToken(user),
        refresh_token: refreshRaw,
        user: { id: user.id, tenant_id: user.tenant_id, name: user.name, email: user.email, role: user.role, timezone: user.timezone },
      });
    } catch (err) {
      console.error('Login error full:', err.message, '| DB URL set:', !!process.env.DATABASE_URL);
      return res.status(500).json({ error: 'Login failed', detail: err.message });
    }
  }
);

// POST /api/auth/refresh
router.post(
  '/refresh',
  [body('refresh_token').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const tokenHash = hashToken(req.body.refresh_token);
    try {
      const { rows } = await pool.query(
        `SELECT rt.revoked_at, rt.expires_at,
                u.id, u.tenant_id, u.email, u.role
         FROM oec_refresh_tokens rt
         JOIN oec_users u ON u.id = rt.user_id
         WHERE rt.token_hash = $1`,
        [tokenHash]
      );

      if (!rows.length) return res.status(401).json({ error: 'Invalid refresh token' });

      const row = rows[0];
      if (row.revoked_at) return res.status(401).json({ error: 'Refresh token revoked' });
      if (new Date(row.expires_at) < new Date()) return res.status(401).json({ error: 'Refresh token expired' });

      return res.json({ access_token: makeAccessToken(row) });
    } catch (err) {
      console.error('Refresh error:', err);
      return res.status(500).json({ error: 'Token refresh failed' });
    }
  }
);

// POST /api/auth/logout
router.post(
  '/logout',
  [body('refresh_token').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const tokenHash = hashToken(req.body.refresh_token);
    try {
      await pool.query(
        'UPDATE oec_refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
        [tokenHash]
      );
      return res.json({ message: 'Logged out successfully' });
    } catch (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
  }
);

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, tenant_id, name, email, role, timezone, created_at
       FROM oec_users WHERE id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: rows[0] });
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

module.exports = router;
