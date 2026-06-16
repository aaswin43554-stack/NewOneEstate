'use strict';

const express    = require('express');
const pool       = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Lazy-init Anthropic client so the server boots even if ANTHROPIC_API_KEY is absent
let _client = null;
function getClient() {
  if (!_client) {
    const Anthropic = require('@anthropic-ai/sdk');
    _client = new Anthropic();
  }
  return _client;
}

function extractJSON(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/);
  try {
    return JSON.parse(fenced ? fenced[1] : text);
  } catch {
    console.error('[AI] JSON parse failed on response:', text?.slice(0, 200));
    return null;
  }
}

// Guard against oversized payloads reaching the Anthropic API
function checkPayloadSize(req, res) {
  const size = JSON.stringify(req.body).length;
  if (size > 20000) {
    res.status(413).json({ error: 'Request payload too large.' });
    return false;
  }
  return true;
}

// ─── POST /api/ai/cupping-structure ──────────────────────────────────────────
// Takes raw cupping observations, returns structured, cleaned-up versions.
router.post('/cupping-structure', async (req, res) => {
  if (!checkPayloadSize(req, res)) return;
  const { obs } = req.body; // { aroma: "...", flavour: "...", ... }
  if (!obs || typeof obs !== 'object') {
    return res.status(400).json({ error: 'obs object required.' });
  }

  const raw = Object.entries(obs)
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  if (!raw) return res.status(400).json({ error: 'No observations provided.' });

  try {
    const response = await getClient().messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      system: [{
        type: 'text',
        text: `You are a professional Q-grader assistant for a specialty coffee roastery.
Your task is to take raw, informal cupping tasting notes and rewrite them using precise specialty coffee vocabulary.
Return ONLY a JSON object with the same keys as the input, each value being a concise, professional tasting descriptor (under 12 words).
Do not add keys that were not present. If a note is already good, improve it slightly.`,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{
        role: 'user',
        content: `Structure these cupping notes:\n\n${raw}\n\nReturn JSON only.`,
      }],
    });

    const text = response.content[0]?.text || '';
    const structured = extractJSON(text);
    if (!structured) return res.status(502).json({ error: 'AI returned unparseable response.' });

    return res.json({ structured });
  } catch (err) {
    console.error('[ai/cupping-structure]', err.message);
    return res.status(502).json({ error: 'AI request failed.' });
  }
});

// ─── POST /api/ai/roast-anomaly ───────────────────────────────────────────────
// Analyzes a roast session's temperature curve for anomalies.
router.post('/roast-anomaly', async (req, res) => {
  const { session_id } = req.body;
  const tenant_id = req.user.tenant_id;

  if (!session_id) return res.status(400).json({ error: 'session_id required.' });

  const { rows: [session] } = await pool.query(
    `SELECT batch_code, charge_temp_c, eject_temp_c, dtr, total_time_seconds,
            development_time_seconds, green_weight_in_g, roasted_weight_out_g,
            variance_flagged, temperature_curve, is_development
     FROM oec_roast_sessions
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [session_id, tenant_id]
  );
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  const curve = Array.isArray(session.temperature_curve) ? session.temperature_curve : [];
  const lossPct = session.roasted_weight_out_g && session.green_weight_in_g
    ? ((1 - session.roasted_weight_out_g / session.green_weight_in_g) * 100).toFixed(1)
    : null;

  const curveSummary = curve.length > 0
    ? `${curve.length} data points. First: ${curve[0].temp}°C at t=${curve[0].t}s. Last: ${curve[curve.length-1].temp}°C at t=${curve[curve.length-1].t}s. Peak: ${Math.max(...curve.map(p => p.temp))}°C.`
    : 'No curve data.';

  const prompt = `Roast session: ${session.batch_code}
Charge temp: ${session.charge_temp_c ?? '—'}°C
Eject temp: ${session.eject_temp_c ?? '—'}°C
DTR: ${session.dtr ?? '—'}%
Total time: ${session.total_time_seconds ? Math.round(session.total_time_seconds / 60) + ' min' : '—'}
Development time: ${session.development_time_seconds ?? '—'}s
Roast loss: ${lossPct ?? '—'}%
Variance flagged by system: ${session.variance_flagged ? 'yes' : 'no'}
Temperature curve: ${curveSummary}

Analyze for anomalies and return JSON with keys:
- anomalies: array of { type, severity (low/medium/high), description }
- overall_assessment: one sentence
- recommendations: array of strings (max 3)`;

  try {
    const response = await getClient().messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      system: [{
        type: 'text',
        text: `You are a specialty coffee roast analyst. Evaluate roast data for anomalies like flicks, stalling, excessive roast loss (>18%), unusually short/long development time, or thermal runaway. Return ONLY valid JSON.`,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text || '';
    const analysis = extractJSON(text);
    if (!analysis) return res.status(502).json({ error: 'AI returned unparseable response.' });

    return res.json({ analysis });
  } catch (err) {
    console.error('[ai/roast-anomaly]', err.message);
    return res.status(502).json({ error: 'AI request failed.' });
  }
});

// ─── POST /api/ai/journal-draft ───────────────────────────────────────────────
// AI-enhanced journal draft for an allocation.
router.post('/journal-draft', async (req, res) => {
  const { allocation_id, doc_type } = req.body;
  const tenant_id = req.user.tenant_id;

  if (!allocation_id || !doc_type) {
    return res.status(400).json({ error: 'allocation_id and doc_type required.' });
  }

  const { rows: [alloc] } = await pool.query(
    'SELECT * FROM oec_allocations WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [allocation_id, tenant_id]
  );
  if (!alloc) return res.status(404).json({ error: 'Allocation not found.' });

  const { rows: roasts } = await pool.query(
    `SELECT batch_code, started_at, status, green_weight_in_g, roasted_weight_out_g,
            charge_temp_c, eject_temp_c, dtr, total_time_seconds, variance_flagged
     FROM oec_roast_sessions
     WHERE allocation_id = $1 AND is_development = false AND deleted_at IS NULL
     ORDER BY started_at`,
    [allocation_id]
  );

  const { rows: cuppings } = await pool.query(
    `SELECT cs.cupping_date, cs.cupping_purpose, cs.legacy_scoring,
            s.score_fragrance_aroma, s.score_flavor, s.score_acidity, s.score_body,
            s.score_balance, s.score_aftertaste, s.score_overall,
            s.score_uniformity, s.score_clean_cup, s.score_sweetness,
            s.acidity_intensity, s.body_level, s.defects_json,
            s.obs_fragrance_dry, s.obs_aroma_wet, s.obs_flavor, s.final_decision
     FROM oec_cupping_sessions cs
     JOIN oec_cupping_samples s ON s.cupping_session_id = cs.id
     JOIN oec_roast_sessions rs ON rs.id = s.roast_session_id
     WHERE rs.allocation_id = $1
     ORDER BY cs.cupping_date`,
    [allocation_id]
  );

  const context = JSON.stringify({ allocation: alloc, roasts, cuppings }, null, 2);

  const prompts = {
    field_notes: 'Write concise field notes covering the lot origin, processing, arrival weight, and any supplier notes. Use bullet points.',
    roast_log: 'Write a professional roast log summarizing all production roast sessions — batch codes, key metrics (weight loss, DTR, eject temp), and any variances noted.',
    cupping_record: 'Write a cupping record summarizing scoring sessions — dates, attribute scores, tasting descriptors, and final decisions.',
    allocation_record: 'Write an allocation summary covering the lot, projected/confirmed bags, requested volumes, pricing, and dispatch timeline.',
  };

  const userPrompt = prompts[doc_type] || prompts.allocation_record;

  try {
    const response = await getClient().messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1500,
      system: [{
        type: 'text',
        text: `You are the documentation writer for One Estate Coffee, a specialty coffee roastery. Write journal entries that are professional, precise, and use specialty coffee vocabulary. Write in plain text with minimal markdown (bullet points ok). Be concise — under 300 words.`,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{
        role: 'user',
        content: `${userPrompt}\n\nData:\n${context}`,
      }],
    });

    const draft = response.content[0]?.text || '';
    return res.json({ draft });
  } catch (err) {
    console.error('[ai/journal-draft]', err.message);
    return res.status(502).json({ error: 'AI request failed.' });
  }
});

// ─── POST /api/ai/stock-forecast ─────────────────────────────────────────────
// Forecasts green stock depletion based on allocation velocity.
router.post('/stock-forecast', async (req, res) => {
  const tenant_id = req.user.tenant_id;

  const { rows: lots } = await pool.query(
    `SELECT lot_code, estate, process, harvest_year, current_weight_g, arrival_date
     FROM oec_lots WHERE tenant_id = $1 AND deleted_at IS NULL AND current_weight_g > 0
     ORDER BY current_weight_g DESC`,
    [tenant_id]
  );

  const { rows: allocs } = await pool.query(
    `SELECT allocation_code, state, planned_green_quantity_g, process, created_at
     FROM oec_allocations WHERE tenant_id = $1 AND deleted_at IS NULL
       AND state NOT IN ('archived', 'dispatched')
     ORDER BY created_at DESC LIMIT 20`,
    [tenant_id]
  );

  const { rows: [usageRow] } = await pool.query(
    `SELECT COALESCE(AVG(planned_green_quantity_g), 0)::int AS avg_alloc_g,
            COUNT(*)::int AS alloc_count_90d
     FROM oec_allocations
     WHERE tenant_id = $1 AND deleted_at IS NULL
       AND created_at > NOW() - INTERVAL '90 days'`,
    [tenant_id]
  );

  const context = JSON.stringify({ lots, activeAllocations: allocs, usage90d: usageRow }, null, 2);

  try {
    const response = await getClient().messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      system: [{
        type: 'text',
        text: `You are a supply chain analyst for a specialty coffee roastery. Analyze green bean stock levels and allocation velocity to forecast depletion. Return ONLY a JSON object with keys:
- summary: one-sentence overview
- forecast: array of { lot_code, current_kg, estimated_depletion_weeks, risk_level (low/medium/high/critical) }
- recommendations: array of strings (max 3 actionable recommendations)`,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{
        role: 'user',
        content: `Analyze this inventory data and forecast stock depletion:\n\n${context}`,
      }],
    });

    const text = response.content[0]?.text || '';
    const forecast = extractJSON(text);
    if (!forecast) return res.status(502).json({ error: 'AI returned unparseable response.' });

    return res.json({ forecast });
  } catch (err) {
    console.error('[ai/stock-forecast]', err.message);
    return res.status(502).json({ error: 'AI request failed.' });
  }
});

// ─── POST /api/ai/yield-patterns ─────────────────────────────────────────────
// Identifies yield variance patterns across roast sessions.
router.post('/yield-patterns', async (req, res) => {
  const tenant_id = req.user.tenant_id;

  const { rows: sessions } = await pool.query(
    `SELECT rs.batch_code, rs.started_at, rs.green_weight_in_g, rs.roasted_weight_out_g,
            rs.charge_temp_c, rs.eject_temp_c, rs.dtr, rs.total_time_seconds,
            rs.variance_flagged, rs.is_development,
            a.process, a.estate
     FROM oec_roast_sessions rs
     LEFT JOIN oec_allocations a ON a.id = rs.allocation_id
     WHERE rs.tenant_id = $1 AND rs.deleted_at IS NULL
       AND rs.status = 'approved_for_bagging'
       AND rs.roasted_weight_out_g IS NOT NULL
     ORDER BY rs.started_at DESC LIMIT 50`,
    [tenant_id]
  );

  if (sessions.length < 3) {
    return res.json({ patterns: { summary: 'Not enough approved sessions to detect patterns yet (need at least 3).', patterns: [], recommendations: [] } });
  }

  const context = JSON.stringify(sessions, null, 2);

  try {
    const response = await getClient().messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1200,
      system: [{
        type: 'text',
        text: `You are a roast quality analyst for a specialty coffee roastery. Analyze historical roast session data to identify yield variance patterns. Return ONLY a JSON object with keys:
- summary: 2-sentence overview of yield consistency
- patterns: array of { pattern, affected_sessions_count, impact } — identify trends like high-loss batches, DTR inconsistency, process-specific yield differences
- avg_roast_loss_pct: number
- recommendations: array of strings (max 4 actionable improvements)`,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{
        role: 'user',
        content: `Identify yield patterns from these roast sessions:\n\n${context}`,
      }],
    });

    const text = response.content[0]?.text || '';
    const patterns = extractJSON(text);
    if (!patterns) return res.status(502).json({ error: 'AI returned unparseable response.' });

    return res.json({ patterns });
  } catch (err) {
    console.error('[ai/yield-patterns]', err.message);
    return res.status(502).json({ error: 'AI request failed.' });
  }
});

module.exports = router;
