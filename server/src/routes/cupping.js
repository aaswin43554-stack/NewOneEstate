const express = require('express');
const pool    = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const {
  getProcessFromSession, generateJournalDraft,
  calcCupCheckScore, calcTotalDefects, REST_DAYS,
} = require('../services/cuppingService');

const router = express.Router();
router.use(requireAuth);

const SCA_SCORED_ATTRS = [
  'fragrance_aroma', 'flavor', 'aftertaste', 'acidity', 'body', 'balance', 'overall',
];

function validateScaScore(value, field) {
  const n = parseFloat(value);
  if (isNaN(n)) return `${field} is required.`;
  if (n < 6 || n > 10) return `${field} must be between 6.00 and 10.00.`;
  if (Math.round(n * 4) !== n * 4) return `${field} must be a multiple of 0.25.`;
  return null;
}

// GET /api/cupping-sessions/compare  (must be before /:id)
router.get('/compare', async (req, res) => {
  const { process } = req.query;
  if (!process) return res.status(400).json({ error: 'process query param is required.' });
  const tenant_id = req.user.tenant_id;

  try {
    const { rows } = await pool.query(
      `SELECT cs.cupping_date, cs.days_off_roast, cs.legacy_scoring,
              sm.score_fragrance_aroma, sm.score_flavor, sm.score_acidity,
              sm.score_body, sm.score_balance, sm.score_aftertaste, sm.score_overall,
              sm.score_uniformity, sm.score_clean_cup, sm.score_sweetness,
              sm.defects_json, sm.final_decision,
              rs.batch_code, rs.is_development, rs.allocation_id,
              a.harvest_year AS alloc_harvest_year
       FROM oec_cupping_sessions cs
       JOIN oec_cupping_samples sm ON sm.cupping_session_id = cs.id
       JOIN oec_roast_sessions rs ON rs.id = sm.roast_session_id
       LEFT JOIN oec_allocations a ON a.id = rs.allocation_id
       WHERE cs.tenant_id = $1 AND cs.deleted_at IS NULL
         AND cs.legacy_scoring = false
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
  const { roast_session_id, cupping_date, cupping_purpose, session_notes, number_of_cups } = req.body;
  if (!roast_session_id || !cupping_date || !cupping_purpose) {
    return res.status(400).json({ error: 'roast_session_id, cupping_date, and cupping_purpose are required.' });
  }

  const VALID_PURPOSES = ['development', 'quality_check', 'comparative'];
  if (!VALID_PURPOSES.includes(cupping_purpose)) {
    return res.status(400).json({ error: `cupping_purpose must be one of: ${VALID_PURPOSES.join(', ')}` });
  }

  const cups = Math.max(3, parseInt(number_of_cups) || 3);

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

  try {
    const { rows: [cuppingSession] } = await pool.query(
      `INSERT INTO oec_cupping_sessions
         (tenant_id, cupping_date, days_off_roast, cupping_purpose, session_notes,
          number_of_cups, early_warning, legacy_scoring, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,$8) RETURNING *`,
      [tenant_id, cupping_date, days_off_roast, cupping_purpose, session_notes || null,
       cups, early_warning, req.user.id]
    );
    return res.status(201).json({
      session: cuppingSession,
      early_warning,
      days_remaining: Math.max(0, min_days - days_off_roast),
    });
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

  const { roast_session_id, final_decision, decision_notes, ...rest } = req.body;
  if (!roast_session_id || !final_decision) {
    return res.status(400).json({ error: 'roast_session_id and final_decision are required.' });
  }

  const { rows: [rs] } = await pool.query(
    'SELECT * FROM oec_roast_sessions WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [roast_session_id, tenant_id]
  );
  if (!rs) return res.status(404).json({ error: 'Roast session not found.' });

  // Validate SCA scored attributes
  for (const attr of SCA_SCORED_ATTRS) {
    const err = validateScaScore(rest[`score_${attr}`], attr);
    if (err) return res.status(400).json({ error: err });
  }

  // Validate decision notes required for adjust/reject
  if (['adjust', 'reject'].includes(final_decision) && !decision_notes?.trim()) {
    return res.status(400).json({ error: 'decision_notes is required when decision is Adjust or Reject.' });
  }

  // Cup-check arrays
  const nCups = cuppingSession.number_of_cups || 3;
  const uniformityCups = Array.isArray(rest.uniformity_cups) ? rest.uniformity_cups.slice(0, nCups) : Array(nCups).fill(true);
  const cleanCupCups   = Array.isArray(rest.clean_cup_cups)  ? rest.clean_cup_cups.slice(0, nCups)  : Array(nCups).fill(true);
  const sweetnessCups  = Array.isArray(rest.sweetness_cups)  ? rest.sweetness_cups.slice(0, nCups)  : Array(nCups).fill(true);

  const scoreUniformity = calcCupCheckScore(uniformityCups);
  const scoreCleanCup   = calcCupCheckScore(cleanCupCups);
  const scoreSweetness  = calcCupCheckScore(sweetnessCups);

  const defectsJson = Array.isArray(rest.defects_json) ? rest.defects_json : [];

  const process = await getProcessFromSession(roast_session_id, tenant_id);
  const { rows: [allocRow] } = rs.allocation_id
    ? await pool.query('SELECT harvest_year FROM oec_allocations WHERE id = $1', [rs.allocation_id])
    : { rows: [{}] };
  const harvest_year = allocRow?.harvest_year ?? null;

  const sampleData = {
    score_fragrance_aroma: parseFloat(rest.score_fragrance_aroma),
    score_flavor:          parseFloat(rest.score_flavor),
    score_aftertaste:      parseFloat(rest.score_aftertaste),
    score_acidity:         parseFloat(rest.score_acidity),
    score_body:            parseFloat(rest.score_body),
    score_balance:         parseFloat(rest.score_balance),
    score_overall:         parseFloat(rest.score_overall),
    uniformity_cups: uniformityCups,
    clean_cup_cups:  cleanCupCups,
    sweetness_cups:  sweetnessCups,
    defects_json:    defectsJson,
    final_decision,
    decision_notes:  decision_notes || null,
  };

  const journal_draft = generateJournalDraft(
    sampleData, { ...rs, harvest_year }, process, cuppingSession.days_off_roast, false
  );

  try {
    const { rows: [created] } = await pool.query(
      `INSERT INTO oec_cupping_samples
         (tenant_id, cupping_session_id, roast_session_id,
          score_fragrance_aroma, score_flavor, score_aftertaste, score_acidity,
          score_body, score_balance, score_overall,
          obs_fragrance_dry, obs_aroma_wet, obs_flavor, obs_aftertaste,
          obs_acidity, obs_body, obs_balance, obs_overall,
          acidity_intensity, body_level,
          uniformity_cups, clean_cup_cups, sweetness_cups,
          score_uniformity, score_clean_cup, score_sweetness,
          defects_json, final_decision, decision_notes, journal_draft,
          created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
               $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$31)
       RETURNING *`,
      [
        tenant_id, cuppingSession.id, roast_session_id,
        sampleData.score_fragrance_aroma, sampleData.score_flavor, sampleData.score_aftertaste,
        sampleData.score_acidity, sampleData.score_body, sampleData.score_balance, sampleData.score_overall,
        rest.obs_fragrance_dry || null, rest.obs_aroma_wet || null, rest.obs_flavor || null,
        rest.obs_aftertaste || null, rest.obs_acidity || null, rest.obs_body || null,
        rest.obs_balance || null, rest.obs_overall || null,
        rest.acidity_intensity || null, rest.body_level || null,
        JSON.stringify(uniformityCups), JSON.stringify(cleanCupCups), JSON.stringify(sweetnessCups),
        scoreUniformity, scoreCleanCup, scoreSweetness,
        JSON.stringify(defectsJson), final_decision, decision_notes || null, journal_draft,
        req.user.id,
      ]
    );

    // If decision is 'approve', unlock linked roast profile for production use
    if (final_decision === 'approve' && rs.allocation_id) {
      await pool.query(
        `UPDATE oec_roast_sessions SET status = 'approved_for_bagging', updated_at = NOW()
         WHERE id = $1 AND status = 'completed'`,
        [roast_session_id]
      );
    }

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

  // If just saving journal draft, fast-path update
  if (body.journal_draft != null && Object.keys(body).length === 1) {
    const { rows: [updated] } = await pool.query(
      'UPDATE oec_cupping_samples SET journal_draft=$1, updated_at=NOW(), updated_by=$2 WHERE id=$3 RETURNING *',
      [body.journal_draft, req.user.id, sample.id]
    );
    return res.json({ sample: updated });
  }

  const merged = { ...sample, ...body };
  const isLegacy = cs.legacy_scoring;

  let journal_draft;
  if (body.journal_draft != null) {
    journal_draft = body.journal_draft;
  } else {
    const process = await getProcessFromSession(sample.roast_session_id, tenant_id);
    const { rows: [rs] } = await pool.query(
      'SELECT * FROM oec_roast_sessions WHERE id = $1', [sample.roast_session_id]
    );
    const { rows: [allocRow] } = rs?.allocation_id
      ? await pool.query('SELECT harvest_year FROM oec_allocations WHERE id = $1', [rs.allocation_id])
      : { rows: [{}] };
    journal_draft = generateJournalDraft(
      merged, { ...rs, harvest_year: allocRow?.harvest_year ?? null },
      process, cs.days_off_roast, isLegacy
    );
  }

  // Recalculate cup-check scores from arrays
  const nCups = cs.number_of_cups || 3;
  const uniformityCups = Array.isArray(merged.uniformity_cups) ? merged.uniformity_cups : sample.uniformity_cups;
  const cleanCupCups   = Array.isArray(merged.clean_cup_cups)  ? merged.clean_cup_cups  : sample.clean_cup_cups;
  const sweetnessCups  = Array.isArray(merged.sweetness_cups)  ? merged.sweetness_cups  : sample.sweetness_cups;
  const scoreUniformity = calcCupCheckScore(uniformityCups);
  const scoreCleanCup   = calcCupCheckScore(cleanCupCups);
  const scoreSweetness  = calcCupCheckScore(sweetnessCups);

  const defectsJson = Array.isArray(merged.defects_json) ? merged.defects_json : sample.defects_json || [];

  try {
    const { rows: [updated] } = await pool.query(
      `UPDATE oec_cupping_samples SET
         score_fragrance_aroma=$1, score_flavor=$2, score_aftertaste=$3,
         score_acidity=$4, score_body=$5, score_balance=$6, score_overall=$7,
         obs_fragrance_dry=$8, obs_aroma_wet=$9, obs_flavor=$10, obs_aftertaste=$11,
         obs_acidity=$12, obs_body=$13, obs_balance=$14, obs_overall=$15,
         acidity_intensity=$16, body_level=$17,
         uniformity_cups=$18, clean_cup_cups=$19, sweetness_cups=$20,
         score_uniformity=$21, score_clean_cup=$22, score_sweetness=$23,
         defects_json=$24, final_decision=$25, decision_notes=$26,
         journal_draft=$27, updated_at=NOW(), updated_by=$28
       WHERE id=$29 RETURNING *`,
      [
        parseFloat(merged.score_fragrance_aroma) || sample.score_fragrance_aroma,
        parseFloat(merged.score_flavor)          || sample.score_flavor,
        parseFloat(merged.score_aftertaste)      || sample.score_aftertaste,
        parseFloat(merged.score_acidity)         || sample.score_acidity,
        parseFloat(merged.score_body)            || sample.score_body,
        merged.score_balance != null ? parseFloat(merged.score_balance) : sample.score_balance,
        parseFloat(merged.score_overall)         || sample.score_overall,
        merged.obs_fragrance_dry  ?? sample.obs_fragrance_dry,
        merged.obs_aroma_wet      ?? sample.obs_aroma_wet,
        merged.obs_flavor         ?? sample.obs_flavor,
        merged.obs_aftertaste     ?? sample.obs_aftertaste,
        merged.obs_acidity        ?? sample.obs_acidity,
        merged.obs_body           ?? sample.obs_body,
        merged.obs_balance        ?? sample.obs_balance,
        merged.obs_overall        ?? sample.obs_overall,
        merged.acidity_intensity  ?? sample.acidity_intensity,
        merged.body_level         ?? sample.body_level,
        JSON.stringify(uniformityCups), JSON.stringify(cleanCupCups), JSON.stringify(sweetnessCups),
        scoreUniformity, scoreCleanCup, scoreSweetness,
        JSON.stringify(defectsJson),
        merged.final_decision     ?? sample.final_decision,
        merged.decision_notes     ?? sample.decision_notes,
        journal_draft,
        req.user.id, sample.id,
      ]
    );
    return res.json({ sample: updated });
  } catch (err) {
    console.error('Update cupping sample:', err);
    return res.status(500).json({ error: 'Failed to update sample.' });
  }
});

module.exports = router;
