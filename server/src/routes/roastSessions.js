const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generateBatchCode, PROCESS_CODE } = require('../services/batchCodeService');

const router = express.Router();
router.use(requireAuth);

const VALID_PROCESSES = ['Washed', 'Honey', 'Natural', 'Anaerobic'];

function getProcessFromBatchCode(batch_code) {
  if (batch_code.startsWith('DEV-AN-')) return 'Anaerobic';
  if (batch_code.startsWith('DEV-W-'))  return 'Washed';
  if (batch_code.startsWith('DEV-H-'))  return 'Honey';
  if (batch_code.startsWith('DEV-N-'))  return 'Natural';
  return null;
}

// POST /api/roast-sessions
router.post('/', requireRole('admin', 'roaster'), async (req, res) => {
  const { is_development, allocation_id, process, charge_temp_c, green_weight_in_g, started_at } = req.body;
  const tenant_id = req.user.tenant_id;

  if (is_development && allocation_id) {
    return res.status(400).json({ error: 'Development sessions cannot be linked to an allocation.' });
  }
  if (!is_development && !allocation_id) {
    return res.status(400).json({ error: 'Production sessions require an allocation_id.' });
  }
  if (!charge_temp_c || !Number.isInteger(Number(charge_temp_c))) {
    return res.status(400).json({ error: 'charge_temp_c is required and must be an integer.' });
  }
  if (!green_weight_in_g || green_weight_in_g <= 0) {
    return res.status(400).json({ error: 'green_weight_in_g must be a positive integer.' });
  }
  if (is_development && !VALID_PROCESSES.includes(process)) {
    return res.status(400).json({ error: 'process is required for development sessions.' });
  }

  if (started_at) {
    const diff = Date.now() - new Date(started_at).getTime();
    if (diff > 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Sessions cannot be backdated more than 24 hours.' });
    }
  }

  let allocation = null;
  let sessionProcess = process;

  if (!is_development) {
    const { rows } = await pool.query(
      `SELECT * FROM oec_allocations WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [allocation_id, tenant_id]
    );
    if (!rows[0]) return res.status(400).json({ error: 'Allocation not found.' });
    allocation = rows[0];
    if (allocation.state !== 'roasting_in_progress') {
      return res.status(400).json({
        error: `Allocation must be in state 'roasting_in_progress'. Current state: ${allocation.state}.`,
      });
    }
    sessionProcess = allocation.process;
  }

  try {
    const batch_code = await generateBatchCode({
      is_development,
      tenant_id,
      allocation_id: allocation_id || null,
      allocation_code: allocation ? allocation.allocation_code : null,
      process: sessionProcess,
    });

    const { rows: [session] } = await pool.query(
      `INSERT INTO oec_roast_sessions
         (tenant_id, allocation_id, is_development, batch_code, green_weight_in_g,
          charge_temp_c, status, started_at, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,'in_progress', $7, $8, $8)
       RETURNING *`,
      [
        tenant_id,
        allocation_id || null,
        !!is_development,
        batch_code,
        parseInt(green_weight_in_g),
        parseInt(charge_temp_c),
        started_at ? new Date(started_at) : new Date(),
        req.user.id,
      ]
    );
    return res.status(201).json({ session });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Batch code conflict. Please retry.' });
    console.error('Create session:', err);
    return res.status(500).json({ error: 'Failed to create roast session.' });
  }
});

// PUT /api/roast-sessions/:id/complete
router.put('/:id/complete', requireRole('admin', 'roaster'), async (req, res) => {
  const { id } = req.params;
  const tenant_id = req.user.tenant_id;
  const { roasted_weight_out_g, eject_temp_c, total_time_seconds, development_time_seconds, temperature_curve } = req.body;

  const { rows: [session] } = await pool.query(
    'SELECT * FROM oec_roast_sessions WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [id, tenant_id]
  );
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (session.status !== 'in_progress') {
    return res.status(400).json({ error: `Session is not in_progress. Current status: ${session.status}.` });
  }
  if (!roasted_weight_out_g || roasted_weight_out_g <= 0) {
    return res.status(400).json({ error: 'roasted_weight_out_g is required.' });
  }
  if (parseInt(roasted_weight_out_g) >= parseInt(session.green_weight_in_g)) {
    return res.status(400).json({ error: 'Roasted weight cannot exceed green weight.' });
  }
  if (!total_time_seconds || total_time_seconds <= 0) {
    return res.status(400).json({ error: 'total_time_seconds is required.' });
  }
  if (!development_time_seconds || development_time_seconds <= 0) {
    return res.status(400).json({ error: 'development_time_seconds is required.' });
  }
  if (parseInt(development_time_seconds) > parseInt(total_time_seconds)) {
    return res.status(400).json({ error: 'Development time cannot exceed total time.' });
  }

  const dtr = Math.round((parseInt(development_time_seconds) / parseInt(total_time_seconds)) * 10000) / 100;

  // Determine process for variance check
  let sessionProcess = null;
  let profile = null;

  if (!session.is_development && session.allocation_id) {
    const { rows: [alloc] } = await pool.query(
      'SELECT process FROM oec_allocations WHERE id = $1',
      [session.allocation_id]
    );
    if (alloc) sessionProcess = alloc.process;
  } else {
    sessionProcess = getProcessFromBatchCode(session.batch_code);
  }

  let variance_flagged = false;
  if (sessionProcess && eject_temp_c) {
    const { rows: [profileRow] } = await pool.query(
      `SELECT eject_temp_c FROM oec_roast_profiles
       WHERE tenant_id = $1 AND process = $2 AND status = 'approved' AND deleted_at IS NULL
       ORDER BY approved_at DESC LIMIT 1`,
      [tenant_id, sessionProcess]
    );
    if (profileRow) {
      profile = profileRow;
      variance_flagged = Math.abs(parseInt(eject_temp_c) - profileRow.eject_temp_c) > 3;
    }
  }

  try {
    const { rows: [updated] } = await pool.query(
      `UPDATE oec_roast_sessions SET
         roasted_weight_out_g = $1, eject_temp_c = $2, total_time_seconds = $3,
         development_time_seconds = $4, dtr = $5, temperature_curve = $6,
         variance_flagged = $7, status = 'completed', ended_at = NOW(),
         updated_at = NOW(), updated_by = $8
       WHERE id = $9 RETURNING *`,
      [
        parseInt(roasted_weight_out_g), parseInt(eject_temp_c), parseInt(total_time_seconds),
        parseInt(development_time_seconds), dtr,
        temperature_curve ? JSON.stringify(temperature_curve) : null,
        variance_flagged, req.user.id, id,
      ]
    );
    return res.json({
      session: updated,
      profile_eject_temp_c: profile ? profile.eject_temp_c : null,
    });
  } catch (err) {
    console.error('Complete session:', err);
    return res.status(500).json({ error: 'Failed to complete roast session.' });
  }
});

// PUT /api/roast-sessions/:id/status
router.put('/:id/status', async (req, res) => {
  const { id } = req.params;
  const tenant_id = req.user.tenant_id;

  if (req.user.role === 'viewer') return res.status(403).json({ error: 'Viewers cannot update session status.' });

  const { rows: [session] } = await pool.query(
    'SELECT * FROM oec_roast_sessions WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [id, tenant_id]
  );
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  const { status: newStatus, is_development } = req.body;
  if (is_development !== undefined) {
    console.warn(`[roastSessions] is_development field ignored in status update for session ${id}`);
  }

  if (newStatus === 'approved_for_bagging' && session.is_development) {
    return res.status(400).json({
      error: 'Development sessions cannot be approved for bagging. Mark as rejected or create a production session.',
    });
  }

  const allowedTransitions = {
    completed: ['approved_for_bagging', 'rejected'],
  };
  if (!allowedTransitions[session.status] || !allowedTransitions[session.status].includes(newStatus)) {
    return res.status(400).json({
      error: `Invalid status transition from '${session.status}' to '${newStatus}'.`,
    });
  }

  try {
    const { rows: [updated] } = await pool.query(
      `UPDATE oec_roast_sessions SET status = $1, updated_at = NOW(), updated_by = $2
       WHERE id = $3 RETURNING *`,
      [newStatus, req.user.id, id]
    );
    return res.json({ session: updated });
  } catch (err) {
    console.error('Update session status:', err);
    return res.status(500).json({ error: 'Failed to update session status.' });
  }
});

// POST /api/roast-sessions/:id/notes
router.post('/:id/notes', async (req, res) => {
  const { id } = req.params;
  const tenant_id = req.user.tenant_id;
  const { note_text, roast_position_s } = req.body;

  if (!note_text || !note_text.trim()) {
    return res.status(400).json({ error: 'note_text is required.' });
  }
  if (roast_position_s === undefined || roast_position_s === null || !Number.isInteger(Number(roast_position_s))) {
    return res.status(400).json({ error: 'roast_position_s is required and must be an integer.' });
  }

  const { rows: [session] } = await pool.query(
    'SELECT id FROM oec_roast_sessions WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [id, tenant_id]
  );
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  try {
    const { rows: [note] } = await pool.query(
      `INSERT INTO oec_session_notes (tenant_id, session_id, note_text, roast_position_s, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tenant_id, id, note_text.trim(), parseInt(roast_position_s), req.user.id]
    );
    return res.status(201).json({ note });
  } catch (err) {
    console.error('Add note:', err);
    return res.status(500).json({ error: 'Failed to add note.' });
  }
});

// GET /api/roast-sessions
router.get('/', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { allocation_id, is_development, status, process } = req.query;

  const params = [tenant_id];
  const conditions = ['s.tenant_id = $1', 's.deleted_at IS NULL'];

  // Allocation-scoped queries must never include dev sessions
  if (allocation_id) {
    params.push(allocation_id);
    conditions.push(`s.allocation_id = $${params.length}`);
    conditions.push('s.is_development = false');
  } else if (is_development !== undefined) {
    conditions.push(`s.is_development = $${params.length + 1}`);
    params.push(is_development === 'true' || is_development === true);
  }

  if (status) {
    params.push(status);
    conditions.push(`s.status = $${params.length}`);
  }

  if (process && !allocation_id) {
    // For dev sessions process is in batch_code; for prod join allocation
    params.push(process);
    conditions.push(`
      (
        (s.is_development = false AND EXISTS (
          SELECT 1 FROM oec_allocations a WHERE a.id = s.allocation_id AND a.process = $${params.length}
        ))
        OR
        (s.is_development = true AND s.batch_code LIKE $${params.length + 1})
      )
    `);
    const processCode = PROCESS_CODE[process] || process;
    params.push(`DEV-${processCode}-%`);
  }

  try {
    const { rows } = await pool.query(
      `SELECT s.* FROM oec_roast_sessions s
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.started_at DESC`,
      params
    );
    return res.json({ sessions: rows });
  } catch (err) {
    console.error('List sessions:', err);
    return res.status(500).json({ error: 'Failed to fetch sessions.' });
  }
});

// GET /api/roast-sessions/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const tenant_id = req.user.tenant_id;

  try {
    const { rows: [session] } = await pool.query(
      'SELECT * FROM oec_roast_sessions WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [id, tenant_id]
    );
    if (!session) return res.status(404).json({ error: 'Session not found.' });

    const { rows: notes } = await pool.query(
      'SELECT * FROM oec_session_notes WHERE session_id = $1 ORDER BY roast_position_s ASC',
      [id]
    );

    return res.json({ session, notes });
  } catch (err) {
    console.error('Get session:', err);
    return res.status(500).json({ error: 'Failed to fetch session.' });
  }
});

module.exports = router;
