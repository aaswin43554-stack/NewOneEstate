'use strict';

const express = require('express');
const pool    = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(','),
    ...rows.map(row => headers.map(h => escape(row[h])).join(',')),
  ].join('\n');
}

const MODULES = {
  lots: async (tenant_id) => {
    const { rows } = await pool.query(
      `SELECT lot_code, estate, process, harvest_year, arrival_date,
              arrival_weight_g, current_weight_g, moisture_content, water_activity,
              storage_location, supplier_notes, created_at
       FROM oec_lots WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY lot_code`,
      [tenant_id]
    );
    return rows;
  },

  allocations: async (tenant_id) => {
    const { rows } = await pool.query(
      `SELECT a.allocation_code, a.estate, a.process, a.harvest_year,
              l.lot_code,
              a.planned_green_quantity_g, a.planned_bag_size_g,
              a.window_open_date, a.window_close_date, a.state,
              COALESCE(SUM(r.quantity_bags) FILTER (WHERE r.status='confirmed'),0)::int AS confirmed_bags,
              COALESCE(SUM(r.quantity_bags) FILTER (WHERE r.status='fulfilled'),0)::int AS fulfilled_bags,
              a.created_at
       FROM oec_allocations a
       LEFT JOIN oec_lots l ON l.id = a.lot_id
       LEFT JOIN oec_allocation_requests r ON r.allocation_id = a.id
       WHERE a.tenant_id = $1 AND a.deleted_at IS NULL
       GROUP BY a.id, l.lot_code
       ORDER BY a.allocation_code`,
      [tenant_id]
    );
    return rows;
  },

  'roast-sessions': async (tenant_id) => {
    const { rows } = await pool.query(
      `SELECT rs.batch_code, rs.is_development, a.allocation_code,
              rs.green_weight_in_g, rs.roasted_weight_out_g,
              rs.charge_temp_c, rs.eject_temp_c,
              rs.total_time_seconds, rs.development_time_seconds, rs.dtr,
              rs.variance_flagged, rs.status, rs.started_at, rs.ended_at
       FROM oec_roast_sessions rs
       LEFT JOIN oec_allocations a ON a.id = rs.allocation_id
       WHERE rs.tenant_id = $1 AND rs.deleted_at IS NULL
       ORDER BY rs.started_at DESC`,
      [tenant_id]
    );
    return rows;
  },

  cupping: async (tenant_id) => {
    const { rows } = await pool.query(
      `SELECT cs.cupping_date, cs.days_off_roast, cs.cupping_purpose,
              cs.number_of_cups, cs.legacy_scoring,
              rs.batch_code,
              sm.score_fragrance_aroma, sm.score_flavor, sm.score_aftertaste,
              sm.score_acidity, sm.acidity_intensity,
              sm.score_body, sm.body_level,
              sm.score_balance, sm.score_overall,
              sm.score_uniformity, sm.score_clean_cup, sm.score_sweetness,
              sm.uniformity_cups, sm.clean_cup_cups, sm.sweetness_cups,
              sm.defects_json,
              sm.obs_fragrance_dry, sm.obs_aroma_wet, sm.obs_flavor,
              sm.obs_aftertaste, sm.obs_acidity, sm.obs_body,
              sm.obs_balance, sm.obs_overall,
              sm.final_decision, sm.decision_notes, cs.session_notes
       FROM oec_cupping_samples sm
       JOIN oec_cupping_sessions cs ON cs.id = sm.cupping_session_id AND cs.deleted_at IS NULL
       JOIN oec_roast_sessions rs   ON rs.id = sm.roast_session_id
       WHERE sm.tenant_id = $1
       ORDER BY cs.cupping_date DESC`,
      [tenant_id]
    );
    return rows;
  },

  contacts: async (tenant_id) => {
    const { rows } = await pool.query(
      `SELECT name, primary_contact_method, location, market_segment,
              preferred_channel, status, created_at
       FROM oec_contacts WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name`,
      [tenant_id]
    );
    return rows;
  },

  profiles: async (tenant_id) => {
    const { rows } = await pool.query(
      `SELECT process, harvest_year, status, estate,
              charge_temp_c, eject_temp_c, total_time_target_s,
              target_dtr, flavour_target,
              created_at, approved_at
       FROM oec_roast_profiles WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY process, harvest_year`,
      [tenant_id]
    );
    return rows;
  },

  labels: async (tenant_id) => {
    const { rows } = await pool.query(
      `SELECT a.allocation_code, a.process, a.estate, a.harvest_year,
              l.roast_date_start, l.roast_date_end,
              l.ready_to_brew_date, l.best_consumed_by_date,
              l.qr_url, l.template_version,
              l.created_at, l.updated_at
       FROM oec_labels l
       JOIN oec_allocations a ON a.id = l.allocation_id
       WHERE l.tenant_id = $1
       ORDER BY l.created_at DESC`,
      [tenant_id]
    );
    return rows;
  },

  journal: async (tenant_id) => {
    const { rows } = await pool.query(
      `SELECT a.allocation_code, a.process, a.estate, a.harvest_year,
              j.document_type, j.status,
              j.draft_content, j.published_content,
              j.updated_at
       FROM oec_journal_entries j
       JOIN oec_allocations a ON a.id = j.allocation_id
       WHERE j.tenant_id = $1 AND j.deleted_at IS NULL
       ORDER BY a.allocation_code, j.document_type`,
      [tenant_id]
    );
    return rows;
  },
};

// GET /api/export/:module?format=csv|json
router.get('/:module', async (req, res) => {
  const { module } = req.params;
  const format = (req.query.format || 'json').toLowerCase();

  if (!MODULES[module]) {
    return res.status(404).json({
      error: `Unknown module '${module}'. Available: ${Object.keys(MODULES).join(', ')}`,
    });
  }
  if (!['csv', 'json'].includes(format)) {
    return res.status(400).json({ error: 'format must be csv or json' });
  }

  try {
    const rows = await MODULES[module](req.user.tenant_id);
    const ts = new Date().toISOString().split('T')[0];
    const filename = `${module}-${ts}.${format}`;

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(toCSV(rows));
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.json({ module, exported_at: new Date().toISOString(), count: rows.length, data: rows });
  } catch (err) {
    console.error(`[export] ${module}:`, err);
    return res.status(500).json({ error: 'Export failed.' });
  }
});

module.exports = router;
