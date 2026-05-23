const express = require('express');
const pool    = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { getProcessFromSession, generateJournalDraft, REST_DAYS } = require('../services/cuppingService');

const router = express.Router();
router.use(requireAuth);

const SCORE_FIELDS = ['aroma', 'flavour', 'acidity', 'body', 'sweetness', 'aftertaste', 'overall'];

// GET /api/cupping-sessions/compare  (must be before /:id)
router.get('/compare', async (req, res) => {
  const { process } = req.query;
  if (!process) return res.status(400).json({ error: 'process query param is required.' });
  const tenant_id = req.user.tenant_id;

  try {
    const { rows } = await pool.query(
      `SELECT cs.cupping_date, cs.days_off_roast,
              sm.score_aroma, sm.score_flavour, sm.score_acidity, sm.score_body,
              sm.score_sweetness, sm.score_aftertaste, sm.score_overall,
              sm.final_decision,
              rs.batch_code, rs.is_development, rs.allocation_id,
              a.harvest_year AS alloc_harvest_year
       FROM oec_cupping_sessions cs
       JOIN oec_cupping_samples sm ON sm.cupping_session_id = cs.id
       JOIN oec_roast_sessions rs ON rs.id = sm.roast_session_id
       LEFT JOIN oec_allocations a ON a.id = rs.allocation_id
       WHERE cs.tenant_id = $1 AND cs.deleted_at IS NULL
         AND (
           (rs.is_development = false AND a.process = $2)
           OR
           (rs.is_development = true AND rs.batch_code LIKE $3)
         )
       ORDER BY cs.cupping_date ASC`,
      [tenant_id, process, `DEV-${ process === 'Anaerobic' ? 'AN' : process === 'Washed' ? 'W' : process === 'Honey' ? 'H' : 'N' }-%`]
    );

    const production  = rows.filter(r => !r.is_development);
    const development = rows.filter(r => r.is_development);
    return res.json({ process, production, development });
  } catch (err) {
    console.error('Cupping compare:', err);
    return res.status(500).json({ error: 'Failed to fetch comparison.' });
  }
});

// GET /api/cupping-sessions
router.get('/', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { roast_session_id, cupping_purpose, process } = req.query;

  const params = [tenant_id];
  const conditions = ['cs.tenant_id = $1', 'cs.deleted_at IS NULL'];
  if (roast_session_id) { params.push(roast_session_id); conditions.push(`sm.roast_session_id = $${params.length}`); }
  if (cupping_purpose)  { params.push(cupping_purpose);  conditions.push(`cs.cupping_purpose = $${params.length}`); }

  let joinFilter = '';
  if (process) {
    const pc = process === 'Anaerobic' ? 'AN' : process === 'Washed' ? 'W' : process === 'Honey' ? 'H' : 'N';
    params.push(process);
    params.push(`DEV-${pc}-%`);
    joinFilter = `AND ((rs.is_development = false AND a.process = $${params.length - 1}) OR (rs.is_development = true AND rs.batch_code LIKE $${params.length}))`;
  }

  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT cs.*,
              COUNT(sm.id) OVER (PARTITION BY cs.id)::int AS sample_count,
              ARRAY_AGG(sm.final_decision) OVER (PARTITION BY cs.id) AS final_decisions
       FROM oec_cupping_sessions cs
       LEFT JOIN oec_cupping_samples sm ON sm.cupping_session_id = cs.id
       LEFT JOIN oec_roast_sessions rs ON rs.id = sm.roast_session_id
       LEFT JOIN oec_allocations a ON a.id = rs.allocation_id
       WHERE ${conditions.join(' AND ')} ${joinFilter}
       ORDER BY cs.cupping_date DESC`,
      params
    );
    return res.json({ sessions: rows });
  } catch (err) {
    console.error('List cupping sessions:', err);
    return res.status(500).json({ error: 'Failed to fetch cupping sessions.' });
  }
});

// GET /api/cupping-sessions/:id
router.get('/:id', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const { rows: [session] } = await pool.query(
      'SELECT * FROM oec_cupping_sessions WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [req.params.id, tenant_id]
    );
    if (!session) return res.status(404).json({ error: 'Cupping session not found.' });

    const { rows: samples } = await pool.query(
      'SELECT * FROM oec_cupping_samples WHERE cupping_session_id = $1 ORDER BY created_at ASC',
      [session.id]
    );
    return res.json({ session, samples });
  } catch (err) {
    console.error('Get cupping session:', err);
    return res.status(500).json({ error: 'Failed to fetch cupping session.' });
  }
});

// POST /api/cupping-sessions
router.post('/', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { roast_session_id, cupping_date, cupping_purpose, session_notes } = req.body;
  if (!roast_session_id || !cupping_date || !cupping_purpose) {
    return res.status(400).json({ error: 'roast_session_id, cupping_date, and cupping_purpose are required.' });
  }

  const { rows: [rs] } = await pool.query(
    'SELECT * FROM oec_roast_sessions WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [roast_session_id, tenant_id]
  );
  if (!rs) return res.status(404).json({ error: 'Roast session not found.' });
  if (!rs.ended_at) return res.status(400).json({ error: 'Cannot cup a session that has not been completed.' });

  const process  = await getProcessFromSession(roast_session_id, tenant_id);
  const endDate  = new Date(rs.ended_at);
  const cupDate  = new Date(cupping_date);
  const days_off_roast = Math.floor((cupDate - endDate) / 86400000);
  const min_days = REST_DAYS[process] || 4;
  const early_warning = days_off_roast < min_days;
  const days_remaining = Math.max(0, min_days - days_off_roast);

  try {
    const { rows: [cuppingSession] } = await pool.query(
      `INSERT INTO oec_cupping_sessions
         (tenant_id, cupping_date, days_off_roast, cupping_purpose, session_notes, early_warning, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
      [tenant_id, cupping_date, days_off_roast, cupping_purpose, session_notes || null, early_warning, req.user.id]
    );
    return res.status(201).json({ session: cuppingSession, early_warning, days_remaining });
  } catch (err) {
    console.error('Create cupping session:', err);
    return res.status(500).json({ error: 'Failed to create cupping session.' });
  }
});

// POST /api/cupping-sessions/:id/samples
router.post('/:id/samples', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { rows: [cuppingSession] } = await pool.query(
    'SELECT * FROM oec_cupping_sessions WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [req.params.id, tenant_id]
  );
  if (!cuppingSession) return res.status(404).json({ error: 'Cupping session not found.' });

  const { roast_session_id, final_decision, ...rest } = req.body;
  if (!roast_session_id || !final_decision) {
    return res.status(400).json({ error: 'roast_session_id and final_decision are required.' });
  }

  for (const attr of SCORE_FIELDS) {
    const score = parseInt(rest[`score_${attr}`]);
    if (isNaN(score) || score < 0 || score > 10) {
      return res.status(400).json({ error: `score_${attr} must be an integer 0–10.` });
    }
  }

  const { rows: [rs] } = await pool.query(
    'SELECT * FROM oec_roast_sessions WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [roast_session_id, tenant_id]
  );
  if (!rs) return res.status(404).json({ error: 'Roast session not found.' });

  const process = await getProcessFromSession(roast_session_id, tenant_id);
  const { rows: [allocRow] } = rs.allocation_id
    ? await pool.query('SELECT harvest_year FROM oec_allocations WHERE id = $1', [rs.allocation_id])
    : { rows: [{}] };
  const harvest_year = allocRow ? allocRow.harvest_year : null;

  const sample = { ...rest, final_decision };
  const journal_draft = generateJournalDraft(sample, { ...rs, harvest_year }, process, cuppingSession.days_off_roast);

  try {
    const { rows: [created] } = await pool.query(
      `INSERT INTO oec_cupping_samples
         (tenant_id, cupping_session_id, roast_session_id,
          score_aroma, score_flavour, score_acidity, score_body, score_sweetness, score_aftertaste, score_overall,
          obs_aroma, obs_flavour, obs_acidity, obs_body, obs_sweetness, obs_aftertaste, obs_overall,
          final_decision, journal_draft, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20)
       RETURNING *`,
      [
        tenant_id, cuppingSession.id, roast_session_id,
        parseInt(rest.score_aroma), parseInt(rest.score_flavour), parseInt(rest.score_acidity),
        parseInt(rest.score_body), parseInt(rest.score_sweetness), parseInt(rest.score_aftertaste),
        parseInt(rest.score_overall),
        rest.obs_aroma || null, rest.obs_flavour || null, rest.obs_acidity || null,
        rest.obs_body || null, rest.obs_sweetness || null, rest.obs_aftertaste || null,
        rest.obs_overall || null,
        final_decision, journal_draft, req.user.id,
      ]
    );
    return res.status(201).json({ sample: created });
  } catch (err) {
    console.error('Create cupping sample:', err);
    return res.status(500).json({ error: 'Failed to create sample.' });
  }
});

// PUT /api/cupping-sessions/:id/samples/:sample_id
router.put('/:id/samples/:sample_id', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { rows: [cs] } = await pool.query(
    'SELECT * FROM oec_cupping_sessions WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [req.params.id, tenant_id]
  );
  if (!cs) return res.status(404).json({ error: 'Cupping session not found.' });

  const { rows: [sample] } = await pool.query(
    'SELECT * FROM oec_cupping_samples WHERE id = $1 AND cupping_session_id = $2',
    [req.params.sample_id, cs.id]
  );
  if (!sample) return res.status(404).json({ error: 'Sample not found.' });

  const body = req.body;
  const merged = { ...sample, ...body };

  let journal_draft;
  if (body.journal_draft != null) {
    journal_draft = body.journal_draft;
  } else {
    const process = await getProcessFromSession(sample.roast_session_id, tenant_id);
    const { rows: [rs] } = await pool.query(
      'SELECT * FROM oec_roast_sessions WHERE id = $1', [sample.roast_session_id]
    );
    const { rows: [allocRow] } = rs && rs.allocation_id
      ? await pool.query('SELECT harvest_year FROM oec_allocations WHERE id = $1', [rs.allocation_id])
      : { rows: [{}] };
    journal_draft = generateJournalDraft(merged, { ...rs, harvest_year: allocRow ? allocRow.harvest_year : null }, process, cs.days_off_roast);
  }

  try {
    const { rows: [updated] } = await pool.query(
      `UPDATE oec_cupping_samples SET
         score_aroma=$1, score_flavour=$2, score_acidity=$3, score_body=$4,
         score_sweetness=$5, score_aftertaste=$6, score_overall=$7,
         obs_aroma=$8, obs_flavour=$9, obs_acidity=$10, obs_body=$11,
         obs_sweetness=$12, obs_aftertaste=$13, obs_overall=$14,
         final_decision=$15, journal_draft=$16, updated_at=NOW(), updated_by=$17
       WHERE id=$18 RETURNING *`,
      [
        parseInt(merged.score_aroma), parseInt(merged.score_flavour), parseInt(merged.score_acidity),
        parseInt(merged.score_body), parseInt(merged.score_sweetness), parseInt(merged.score_aftertaste),
        parseInt(merged.score_overall),
        merged.obs_aroma||null, merged.obs_flavour||null, merged.obs_acidity||null,
        merged.obs_body||null, merged.obs_sweetness||null, merged.obs_aftertaste||null, merged.obs_overall||null,
        merged.final_decision, journal_draft, req.user.id, sample.id,
      ]
    );
    return res.json({ sample: updated });
  } catch (err) {
    console.error('Update cupping sample:', err);
    return res.status(500).json({ error: 'Failed to update sample.' });
  }
});

module.exports = router;
