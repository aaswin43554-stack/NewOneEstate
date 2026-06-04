const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const VALID_PROCESSES = ['Washed', 'Honey', 'Natural', 'Anaerobic'];

// GET /api/profiles/active  (must be before /:id)
router.get('/active', async (req, res) => {
  const { process } = req.query;
  if (!process) return res.status(400).json({ error: 'process query param is required.' });

  try {
    const { rows: [profile] } = await pool.query(
      `SELECT p.*, u.name AS approved_by_name
       FROM oec_roast_profiles p
       LEFT JOIN oec_users u ON u.id = p.approved_by
       WHERE p.tenant_id = $1 AND p.process = $2 AND p.status = 'approved' AND p.deleted_at IS NULL
       ORDER BY p.approved_at DESC LIMIT 1`,
      [req.user.tenant_id, process]
    );
    if (!profile) return res.status(404).json({ error: `No approved profile for ${process}.` });
    return res.json({ profile });
  } catch (err) {
    console.error('Get active profile:', err);
    return res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

// GET /api/profiles
router.get('/', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { process, harvest_year, status } = req.query;

  const params = [tenant_id];
  const conditions = ['p.tenant_id = $1', 'p.deleted_at IS NULL'];
  if (process)      { params.push(process);            conditions.push(`p.process = $${params.length}`); }
  if (harvest_year) { params.push(parseInt(harvest_year)); conditions.push(`p.harvest_year = $${params.length}`); }
  if (status)       { params.push(status);             conditions.push(`p.status = $${params.length}`); }

  try {
    const { rows } = await pool.query(
      `SELECT p.*, u.name AS approved_by_name
       FROM oec_roast_profiles p
       LEFT JOIN oec_users u ON u.id = p.approved_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.process ASC, p.harvest_year DESC, p.created_at DESC`,
      params
    );
    return res.json({ profiles: rows });
  } catch (err) {
    console.error('List profiles:', err);
    return res.status(500).json({ error: 'Failed to fetch profiles.' });
  }
});

// GET /api/profiles/:id
router.get('/:id', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const { rows: [profile] } = await pool.query(
      `SELECT p.*, u.name AS approved_by_name
       FROM oec_roast_profiles p
       LEFT JOIN oec_users u ON u.id = p.approved_by
       WHERE p.id = $1 AND p.tenant_id = $2 AND p.deleted_at IS NULL`,
      [req.params.id, tenant_id]
    );
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    let parent_profile = null;
    if (profile.parent_profile_id) {
      const { rows: [parent] } = await pool.query(
        'SELECT id, estate, process, harvest_year, status FROM oec_roast_profiles WHERE id = $1',
        [profile.parent_profile_id]
      );
      parent_profile = parent || null;
    }

    return res.json({ profile: { ...profile, parent_profile } });
  } catch (err) {
    console.error('Get profile:', err);
    return res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

// POST /api/profiles
router.post('/', requireRole('admin', 'roaster'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const {
    source_session_id,
    estate, process, harvest_year, charge_temp_c, target_dtr, eject_temp_c,
    total_time_target_s, flavour_target,
  } = req.body;

  if (!process || !VALID_PROCESSES.includes(process)) {
    return res.status(400).json({ error: 'A valid process is required.' });
  }
  if (!harvest_year) {
    return res.status(400).json({ error: 'harvest_year is required.' });
  }

  // ── From-session path ────────────────────────────────────────────────────
  if (source_session_id) {
    const { rows: [session] } = await pool.query(
      `SELECT * FROM oec_roast_sessions
       WHERE id = $1 AND tenant_id = $2 AND is_development = true
         AND status NOT IN ('in_progress') AND deleted_at IS NULL`,
      [source_session_id, tenant_id]
    );
    if (!session) {
      return res.status(400).json({ error: 'Session not found or not eligible for profile activation.' });
    }

    const chargeC = Math.round(parseFloat(session.charge_temp_c));
    const ejectC  = Math.round(parseFloat(session.eject_temp_c));
    const dtr     = parseFloat(session.dtr);
    const totalS  = parseInt(session.total_time_seconds);
    const estateV = session.estate || estate || '';

    if (!estateV) return res.status(400).json({ error: 'estate is required.' });

    try {
      const { rows: [profile] } = await pool.query(
        `INSERT INTO oec_roast_profiles
           (tenant_id, source_session_id, estate, process, harvest_year,
            charge_temp_c, target_dtr, eject_temp_c, total_time_target_s, flavour_target,
            status, approved_at, approved_by, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved',NOW(),$11,$11,$11) RETURNING *`,
        [
          tenant_id, source_session_id, estateV, process, parseInt(harvest_year),
          chargeC, dtr, ejectC, totalS, flavour_target || null,
          req.user.id,
        ]
      );
      return res.status(201).json({ profile });
    } catch (err) {
      console.error('Create profile from session:', err);
      return res.status(500).json({ error: 'Failed to create profile.' });
    }
  }

  // ── Manual path ──────────────────────────────────────────────────────────
  if (!estate || !charge_temp_c || !target_dtr || !eject_temp_c || !total_time_target_s) {
    return res.status(400).json({ error: 'All fields are required for manual profile creation.' });
  }

  try {
    const { rows: [profile] } = await pool.query(
      `INSERT INTO oec_roast_profiles
         (tenant_id, estate, process, harvest_year, charge_temp_c, target_dtr,
          eject_temp_c, total_time_target_s, flavour_target, status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'development',$10,$10) RETURNING *`,
      [tenant_id, estate, process, parseInt(harvest_year), parseInt(charge_temp_c),
       parseFloat(target_dtr), parseInt(eject_temp_c), parseInt(total_time_target_s),
       flavour_target || null, req.user.id]
    );
    return res.status(201).json({ profile });
  } catch (err) {
    console.error('Create profile:', err);
    return res.status(500).json({ error: 'Failed to create profile.' });
  }
});

// PUT /api/profiles/:id
router.put('/:id', requireRole('admin', 'roaster'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { rows: [profile] } = await pool.query(
    'SELECT * FROM oec_roast_profiles WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [req.params.id, tenant_id]
  );
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });
  if (profile.status !== 'development') {
    return res.status(400).json({ error: 'This profile cannot be edited. Only development profiles can be modified.' });
  }

  const { estate, charge_temp_c, target_dtr, eject_temp_c, total_time_target_s, flavour_target } = req.body;
  try {
    const { rows: [updated] } = await pool.query(
      `UPDATE oec_roast_profiles SET
         estate = COALESCE($1, estate),
         charge_temp_c = COALESCE($2, charge_temp_c),
         target_dtr = COALESCE($3, target_dtr),
         eject_temp_c = COALESCE($4, eject_temp_c),
         total_time_target_s = COALESCE($5, total_time_target_s),
         flavour_target = COALESCE($6, flavour_target),
         updated_at = NOW(), updated_by = $7
       WHERE id = $8 RETURNING *`,
      [
        estate || null,
        charge_temp_c ? parseInt(charge_temp_c) : null,
        target_dtr ? parseFloat(target_dtr) : null,
        eject_temp_c ? parseInt(eject_temp_c) : null,
        total_time_target_s ? parseInt(total_time_target_s) : null,
        flavour_target || null,
        req.user.id, profile.id,
      ]
    );
    return res.json({ profile: updated });
  } catch (err) {
    console.error('Update profile:', err);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// POST /api/profiles/:id/submit
router.post('/:id/submit', requireRole('admin', 'roaster'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { rows: [profile] } = await pool.query(
    'SELECT * FROM oec_roast_profiles WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [req.params.id, tenant_id]
  );
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });
  if (profile.status !== 'development') {
    return res.status(400).json({ error: 'Only development profiles can be submitted.' });
  }

  const { rows: [updated] } = await pool.query(
    `UPDATE oec_roast_profiles SET status = 'pending_approval', updated_at = NOW(), updated_by = $1
     WHERE id = $2 RETURNING *`,
    [req.user.id, profile.id]
  );
  return res.json({ profile: updated });
});

// POST /api/profiles/:id/approve
router.post('/:id/approve', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can approve profiles.' });
  }
  const tenant_id = req.user.tenant_id;
  const { rows: [profile] } = await pool.query(
    'SELECT * FROM oec_roast_profiles WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [req.params.id, tenant_id]
  );
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });
  if (profile.status !== 'pending_approval') {
    return res.status(400).json({ error: 'Profile must be in pending_approval status.' });
  }

  try {
    const { rows: [updated] } = await pool.query(
      `UPDATE oec_roast_profiles
       SET status = 'approved', approved_at = NOW(), approved_by = $1,
           updated_at = NOW(), updated_by = $1
       WHERE id = $2 RETURNING *`,
      [req.user.id, profile.id]
    );
    return res.json({ profile: updated });
  } catch (err) {
    console.error('Approve profile:', err);
    return res.status(500).json({ error: 'Failed to approve profile.' });
  }
});

// POST /api/profiles/:id/retire
router.post('/:id/retire', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can retire profiles.' });
  }
  const tenant_id = req.user.tenant_id;
  const { rows: [profile] } = await pool.query(
    'SELECT * FROM oec_roast_profiles WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [req.params.id, tenant_id]
  );
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });
  if (profile.status !== 'approved') {
    return res.status(400).json({ error: 'Only approved profiles can be retired.' });
  }

  try {
    const { rows: [updated] } = await pool.query(
      `UPDATE oec_roast_profiles SET status = 'retired', updated_at = NOW(), updated_by = $1
       WHERE id = $2 RETURNING *`,
      [req.user.id, profile.id]
    );
    return res.json({ profile: updated });
  } catch (err) {
    console.error('Retire profile:', err);
    return res.status(500).json({ error: 'Failed to retire profile.' });
  }
});

// POST /api/profiles/:id/duplicate
router.post('/:id/duplicate', requireRole('admin', 'roaster'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { rows: [source] } = await pool.query(
    'SELECT * FROM oec_roast_profiles WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [req.params.id, tenant_id]
  );
  if (!source) return res.status(404).json({ error: 'Profile not found.' });

  try {
    const { rows: [newProfile] } = await pool.query(
      `INSERT INTO oec_roast_profiles
         (tenant_id, estate, process, harvest_year, charge_temp_c, target_dtr,
          eject_temp_c, total_time_target_s, flavour_target, status,
          parent_profile_id, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'development',$10,$11,$11) RETURNING *`,
      [
        tenant_id, source.estate, source.process, source.harvest_year + 1,
        source.charge_temp_c, source.target_dtr, source.eject_temp_c,
        source.total_time_target_s, source.flavour_target,
        source.id, req.user.id,
      ]
    );
    return res.status(201).json({ profile: newProfile });
  } catch (err) {
    console.error('Duplicate profile:', err);
    return res.status(500).json({ error: 'Failed to duplicate profile.' });
  }
});

module.exports = router;
