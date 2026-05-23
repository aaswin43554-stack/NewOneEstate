const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const DOC_TYPES = ['field_notes', 'roast_log', 'cupping_record', 'allocation_record'];

// ─── Draft content generators ────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toISOString().split('T')[0];
}

function fmtG(g) { return g != null ? `${(g / 1000).toFixed(2)} kg` : '—'; }

async function buildFieldNotesDraft(allocation, tenant_id) {
  if (!allocation.lot_id) return 'No lot linked to this allocation.';

  const { rows: [lot] } = await pool.query(
    'SELECT * FROM oec_lots WHERE id = $1 AND tenant_id = $2',
    [allocation.lot_id, tenant_id]
  );
  if (!lot) return 'Lot data not found.';

  const lines = [
    `Lot: ${lot.lot_code}`,
    `Estate: ${lot.estate}`,
    `Process: ${lot.process}`,
    `Harvest Year: ${lot.harvest_year}`,
    `Arrival Date: ${fmtDate(lot.arrival_date)}`,
    `Arrival Weight: ${fmtG(lot.arrival_weight_g)}`,
    `Current Weight: ${fmtG(lot.current_weight_g)}`,
    lot.moisture_content != null ? `Moisture Content: ${lot.moisture_content}%` : null,
    lot.water_activity   != null ? `Water Activity: ${lot.water_activity}` : null,
    `Storage Location: ${lot.storage_location || '—'}`,
    lot.supplier_notes ? `Supplier Notes: ${lot.supplier_notes}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}

async function buildRoastLogDraft(allocation, tenant_id) {
  const { rows: sessions } = await pool.query(
    `SELECT * FROM oec_roast_sessions
     WHERE allocation_id = $1 AND is_development = false AND deleted_at IS NULL
     ORDER BY started_at ASC`,
    [allocation.id]
  );
  if (sessions.length === 0) return 'No production roast sessions recorded for this allocation.';

  const lines = [`Allocation ${allocation.allocation_code} — Roast Log`, ''];
  for (const s of sessions) {
    const dtr_pct = s.dtr != null ? `${s.dtr}%` : '—';
    const total_min = s.total_time_seconds ? Math.round(s.total_time_seconds / 60) + ' min' : '—';
    const dev_sec   = s.development_time_seconds != null ? `${s.development_time_seconds}s` : '—';
    const loss_pct  = s.roasted_weight_out_g && s.green_weight_in_g
      ? ((1 - s.roasted_weight_out_g / s.green_weight_in_g) * 100).toFixed(1) + '%'
      : '—';

    lines.push(`Batch: ${s.batch_code}`);
    lines.push(`  Started: ${fmtDate(s.started_at)}  |  Status: ${s.status}`);
    lines.push(`  Green weight in: ${fmtG(s.green_weight_in_g)}  |  Roasted weight out: ${fmtG(s.roasted_weight_out_g)}  |  Roast loss: ${loss_pct}`);
    lines.push(`  Charge temp: ${s.charge_temp_c != null ? s.charge_temp_c + '°C' : '—'}  |  Eject temp: ${s.eject_temp_c != null ? s.eject_temp_c + '°C' : '—'}`);
    lines.push(`  Total time: ${total_min}  |  Development time: ${dev_sec}  |  DTR: ${dtr_pct}`);
    if (s.variance_flagged) lines.push('  ⚠ Eject temperature variance flagged (>±3°C from approved profile)');
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

async function buildCuppingRecordDraft(allocation, tenant_id) {
  const { rows: sessions } = await pool.query(
    `SELECT rs.id FROM oec_roast_sessions rs
     WHERE rs.allocation_id = $1 AND rs.is_development = false AND rs.deleted_at IS NULL`,
    [allocation.id]
  );
  if (sessions.length === 0) return 'No production roast sessions linked to this allocation.';

  const sessionIds = sessions.map(s => s.id);
  const { rows: samples } = await pool.query(
    `SELECT cs.cupping_date, cs.days_off_roast, cs.cupping_purpose, cs.session_notes,
            sm.*, rs.batch_code
     FROM oec_cupping_samples sm
     JOIN oec_cupping_sessions cs ON cs.id = sm.cupping_session_id
     JOIN oec_roast_sessions rs   ON rs.id = sm.roast_session_id
     WHERE sm.roast_session_id = ANY($1::uuid[]) AND cs.deleted_at IS NULL
     ORDER BY cs.cupping_date ASC, sm.created_at ASC`,
    [sessionIds]
  );
  if (samples.length === 0) return 'No cupping records found for this allocation.';

  const lines = [`Allocation ${allocation.allocation_code} — Cupping Record`, ''];
  for (const s of samples) {
    lines.push(`Batch: ${s.batch_code}  |  Date: ${fmtDate(s.cupping_date)}  |  Days off roast: ${s.days_off_roast}`);
    lines.push(`Purpose: ${s.cupping_purpose}`);
    lines.push(`Scores — Aroma: ${s.score_aroma}/10  Flavour: ${s.score_flavour}/10  Acidity: ${s.score_acidity}/10`);
    lines.push(`         Body: ${s.score_body}/10  Sweetness: ${s.score_sweetness}/10  Aftertaste: ${s.score_aftertaste}/10  Overall: ${s.score_overall}/10`);
    const attrs = [
      ['Aroma',      s.obs_aroma],
      ['Flavour',    s.obs_flavour],
      ['Acidity',    s.obs_acidity],
      ['Body',       s.obs_body],
      ['Sweetness',  s.obs_sweetness],
      ['Aftertaste', s.obs_aftertaste],
      ['Overall',    s.obs_overall],
    ].filter(([, v]) => v && v.trim());
    if (attrs.length > 0) {
      lines.push('Observations:');
      for (const [label, obs] of attrs) lines.push(`  ${label}: ${obs}`);
    }
    if (s.session_notes) lines.push(`Session notes: ${s.session_notes}`);
    lines.push(`Decision: ${s.final_decision.toUpperCase()}`);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

async function buildAllocationRecordDraft(allocation, tenant_id) {
  const { rows: [agg] } = await pool.query(
    `SELECT COALESCE(SUM(quantity_bags) FILTER (WHERE status='confirmed'),0)::int  AS confirmed_bags,
            COALESCE(SUM(quantity_bags) FILTER (WHERE status='fulfilled'),0)::int  AS fulfilled_bags,
            COALESCE(SUM(quantity_bags) FILTER (WHERE status='pending'),0)::int    AS pending_bags,
            COUNT(*)::int                                                           AS total_requests
     FROM oec_allocation_requests WHERE allocation_id = $1`,
    [allocation.id]
  );

  const price_json = allocation.planned_price_json || {};
  const priceStr = Object.keys(price_json).length > 0
    ? Object.entries(price_json).map(([mkt, p]) => `${mkt}: ${p}`).join(', ')
    : '—';

  const lines = [
    `Allocation: ${allocation.allocation_code}`,
    `Estate: ${allocation.estate}`,
    `Process: ${allocation.process}`,
    `Harvest Year: ${allocation.harvest_year}`,
    '',
    `Planned Green Quantity: ${fmtG(allocation.planned_green_quantity_g)}`,
    `Planned Bag Size: ${allocation.planned_bag_size_g}g`,
    `Pricing: ${priceStr}`,
    '',
    `Request Window: ${fmtDate(allocation.window_open_date)} to ${fmtDate(allocation.window_close_date)}`,
    `Total Requests: ${agg.total_requests}`,
    `Confirmed Bags: ${agg.confirmed_bags}`,
    `Fulfilled Bags: ${agg.fulfilled_bags}`,
    `Pending Bags: ${agg.pending_bags}`,
    '',
    `Current State: ${allocation.state}`,
  ];

  return lines.join('\n');
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/journal/generate/:allocation_id  — must be before /:allocation_id GET
router.post('/generate/:allocation_id', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { allocation_id } = req.params;

  const { rows: [allocation] } = await pool.query(
    'SELECT * FROM oec_allocations WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [allocation_id, tenant_id]
  );
  if (!allocation) return res.status(404).json({ error: 'Allocation not found.' });

  const generators = {
    field_notes:       () => buildFieldNotesDraft(allocation, tenant_id),
    roast_log:         () => buildRoastLogDraft(allocation, tenant_id),
    cupping_record:    () => buildCuppingRecordDraft(allocation, tenant_id),
    allocation_record: () => buildAllocationRecordDraft(allocation, tenant_id),
  };

  try {
    const results = {};
    for (const doc_type of DOC_TYPES) {
      // Skip if already published
      const { rows: [existing] } = await pool.query(
        `SELECT id, status FROM oec_journal_entries
         WHERE allocation_id = $1 AND document_type = $2 AND deleted_at IS NULL`,
        [allocation_id, doc_type]
      );

      if (existing?.status === 'published') {
        results[doc_type] = { status: 'published', skipped: true };
        continue;
      }

      const draft_content = await generators[doc_type]();

      if (existing) {
        if (['draft', 'under_review'].includes(existing.status)) {
          await pool.query(
            `UPDATE oec_journal_entries
             SET draft_content = $1, updated_at = NOW(), updated_by = $2
             WHERE id = $3`,
            [draft_content, req.user.id, existing.id]
          );
          results[doc_type] = { status: existing.status, action: 'updated' };
        }
      } else {
        const { rows: [created] } = await pool.query(
          `INSERT INTO oec_journal_entries
             (tenant_id, allocation_id, document_type, status, draft_content, created_by, updated_by)
           VALUES ($1,$2,$3,'draft',$4,$5,$5) RETURNING id, status`,
          [tenant_id, allocation_id, doc_type, draft_content, req.user.id]
        );
        results[doc_type] = { status: created.status, action: 'created' };
      }
    }
    return res.json({ ok: true, results });
  } catch (err) {
    console.error('Generate journal drafts:', err);
    return res.status(500).json({ error: 'Failed to generate drafts.' });
  }
});

// GET /api/journal
router.get('/', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const { rows: allocations } = await pool.query(
      `SELECT id, allocation_code, process, harvest_year, estate, state
       FROM oec_allocations
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY allocation_code ASC`,
      [tenant_id]
    );

    const { rows: entries } = await pool.query(
      `SELECT allocation_id, document_type, status, id
       FROM oec_journal_entries
       WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenant_id]
    );

    // Index entries by allocation_id → document_type → status
    const entryMap = {};
    for (const e of entries) {
      if (!entryMap[e.allocation_id]) entryMap[e.allocation_id] = {};
      entryMap[e.allocation_id][e.document_type] = { id: e.id, status: e.status };
    }

    const result = allocations.map(a => ({
      allocation_id:   a.id,
      allocation_code: a.allocation_code,
      process:         a.process,
      harvest_year:    a.harvest_year,
      estate:          a.estate,
      state:           a.state,
      documents:       entryMap[a.id] || {},
    }));

    return res.json({ entries: result });
  } catch (err) {
    console.error('List journal:', err);
    return res.status(500).json({ error: 'Failed to fetch journal.' });
  }
});

// GET /api/journal/:allocation_id
router.get('/:allocation_id', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { allocation_id } = req.params;

  try {
    const { rows: [allocation] } = await pool.query(
      'SELECT * FROM oec_allocations WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [allocation_id, tenant_id]
    );
    if (!allocation) return res.status(404).json({ error: 'Allocation not found.' });

    const { rows: entries } = await pool.query(
      'SELECT * FROM oec_journal_entries WHERE allocation_id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [allocation_id, tenant_id]
    );

    const documents = {};
    for (const entry of entries) {
      const { rows: versions } = await pool.query(
        `SELECT v.*, u.name AS edited_by_name
         FROM oec_journal_versions v
         LEFT JOIN oec_users u ON u.id = v.edited_by
         WHERE v.entry_id = $1
         ORDER BY v.version_number ASC`,
        [entry.id]
      );
      documents[entry.document_type] = { ...entry, versions };
    }

    return res.json({ allocation, documents });
  } catch (err) {
    console.error('Get journal:', err);
    return res.status(500).json({ error: 'Failed to fetch journal.' });
  }
});

// PUT /api/journal/:id  — save draft content
router.put('/:id', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { draft_content } = req.body;

  const { rows: [entry] } = await pool.query(
    'SELECT * FROM oec_journal_entries WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [req.params.id, tenant_id]
  );
  if (!entry) return res.status(404).json({ error: 'Journal entry not found.' });
  if (entry.status === 'published') {
    return res.status(400).json({ error: 'Published entries cannot be edited this way. Use edit-published.' });
  }

  try {
    const { rows: [updated] } = await pool.query(
      `UPDATE oec_journal_entries SET draft_content = $1, updated_at = NOW(), updated_by = $2
       WHERE id = $3 RETURNING *`,
      [draft_content ?? entry.draft_content, req.user.id, entry.id]
    );
    return res.json({ entry: updated });
  } catch (err) {
    console.error('Update journal entry:', err);
    return res.status(500).json({ error: 'Failed to update entry.' });
  }
});

// POST /api/journal/:id/submit  — draft → under_review
router.post('/:id/submit', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { rows: [entry] } = await pool.query(
    'SELECT * FROM oec_journal_entries WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [req.params.id, tenant_id]
  );
  if (!entry) return res.status(404).json({ error: 'Journal entry not found.' });
  if (entry.status !== 'draft') {
    return res.status(400).json({ error: `Entry must be in draft status. Current status: ${entry.status}.` });
  }

  const { rows: [updated] } = await pool.query(
    `UPDATE oec_journal_entries SET status = 'under_review', updated_at = NOW(), updated_by = $1
     WHERE id = $2 RETURNING *`,
    [req.user.id, entry.id]
  );
  return res.json({ entry: updated });
});

// POST /api/journal/:id/publish  — under_review → published (admin only)
router.post('/:id/publish', requireRole('admin'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { rows: [entry] } = await pool.query(
    'SELECT * FROM oec_journal_entries WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [req.params.id, tenant_id]
  );
  if (!entry) return res.status(404).json({ error: 'Journal entry not found.' });
  if (entry.status !== 'under_review') {
    return res.status(400).json({ error: `Entry must be under review to publish. Current status: ${entry.status}.` });
  }

  const { rows: [updated] } = await pool.query(
    `UPDATE oec_journal_entries
     SET status = 'published', published_content = draft_content, updated_at = NOW(), updated_by = $1
     WHERE id = $2 RETURNING *`,
    [req.user.id, entry.id]
  );
  return res.json({ entry: updated });
});

// PUT /api/journal/:id/edit-published  — versioned edit of published entry (admin only)
router.put('/:id/edit-published', requireRole('admin'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { content, edit_reason } = req.body;

  if (!edit_reason || !edit_reason.trim()) {
    return res.status(400).json({ error: 'edit_reason is required.' });
  }

  const { rows: [entry] } = await pool.query(
    'SELECT * FROM oec_journal_entries WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [req.params.id, tenant_id]
  );
  if (!entry) return res.status(404).json({ error: 'Journal entry not found.' });
  if (entry.status !== 'published') {
    return res.status(400).json({ error: 'Only published entries can be edited this way.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get next version number
    const { rows: [vRow] } = await client.query(
      'SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version FROM oec_journal_versions WHERE entry_id = $1',
      [entry.id]
    );
    const version_number = vRow.next_version;

    // Archive current content as a version
    await client.query(
      `INSERT INTO oec_journal_versions (tenant_id, entry_id, version_number, content, edit_reason, edited_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [tenant_id, entry.id, version_number, entry.published_content, edit_reason.trim(), req.user.id]
    );

    // Update published content
    const { rows: [updated] } = await client.query(
      `UPDATE oec_journal_entries
       SET published_content = $1, draft_content = $1, updated_at = NOW(), updated_by = $2
       WHERE id = $3 RETURNING *`,
      [content, req.user.id, entry.id]
    );

    await client.query('COMMIT');
    return res.json({ entry: updated });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Edit published entry:', err);
    return res.status(500).json({ error: 'Failed to edit entry.' });
  } finally {
    client.release();
  }
});

// DELETE /api/journal/:id  — soft delete (draft or under_review only, admin only)
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { rows: [entry] } = await pool.query(
    'SELECT * FROM oec_journal_entries WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [req.params.id, tenant_id]
  );
  if (!entry) return res.status(404).json({ error: 'Journal entry not found.' });
  if (entry.status === 'published') {
    return res.status(400).json({ error: 'Published entries cannot be deleted.' });
  }

  await pool.query(
    'UPDATE oec_journal_entries SET deleted_at = NOW(), updated_by = $1 WHERE id = $2',
    [req.user.id, entry.id]
  );
  return res.json({ ok: true });
});

module.exports = router;
