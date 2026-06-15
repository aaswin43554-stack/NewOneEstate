const express = require('express');
const QRCode  = require('qrcode');
const pool    = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const REST_DAYS = { Washed: 4, Honey: 5, Natural: 7, Anaerobic: 7 };
const TEMPLATE_VERSION = 'v1.0';

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// GET /api/labels — list allocations with label status
router.get('/', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.allocation_code, a.process, a.state, a.harvest_year,
              l.id AS label_id, l.generated_at,
              l.estate_location, l.variety, l.roast_level, l.flavour_notes,
              l.net_weight_g, l.label_image, l.qr_code_base64
       FROM oec_allocations a
       LEFT JOIN oec_labels l ON l.allocation_id = a.id AND l.tenant_id = a.tenant_id
       WHERE a.tenant_id = $1 AND a.deleted_at IS NULL
       ORDER BY a.created_at DESC`,
      [tenant_id]
    );
    return res.json({ allocations: rows });
  } catch (err) {
    console.error('List labels:', err);
    return res.status(500).json({ error: 'Failed to fetch labels.' });
  }
});

// POST /api/labels/generate — create or update a label
router.post('/generate', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const {
    allocation_id,
    estate_location, variety, roast_level, flavour_notes, net_weight_g, label_image,
  } = req.body;
  if (!allocation_id) return res.status(400).json({ error: 'allocation_id is required.' });

  const { rows: [alloc] } = await pool.query(
    'SELECT * FROM oec_allocations WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [allocation_id, tenant_id]
  );
  if (!alloc) return res.status(404).json({ error: 'Allocation not found.' });

  // Derive roast dates from completed sessions (optional)
  const { rows: sessions } = await pool.query(
    `SELECT started_at, ended_at FROM oec_roast_sessions
     WHERE allocation_id = $1 AND is_development = false
       AND status IN ('completed', 'approved_for_bagging') AND deleted_at IS NULL`,
    [allocation_id]
  );

  let roast_date_start = null, roast_date_end = null;
  let ready_to_brew_date = null, best_consumed_by_date = null;
  if (sessions.length > 0) {
    const startDates = sessions.map(s => new Date(s.started_at));
    const endDates   = sessions.filter(s => s.ended_at).map(s => new Date(s.ended_at));
    roast_date_start = new Date(Math.min(...startDates)).toISOString().split('T')[0];
    if (endDates.length > 0) {
      roast_date_end = new Date(Math.max(...endDates)).toISOString().split('T')[0];
      const rest_days = REST_DAYS[alloc.process] || 7;
      ready_to_brew_date    = addDays(roast_date_end, rest_days);
      best_consumed_by_date = addDays(roast_date_end, 90);
    }
  }

  const baseUrl = (process.env.APP_URL || 'https://newoneestate.onrender.com').replace(/\/$/, '');
  const qr_url  = `${baseUrl}/public/journal/${alloc.allocation_code}`;

  let qr_code_base64;
  try {
    const buffer = await QRCode.toBuffer(qr_url, { type: 'png', width: 300 });
    qr_code_base64 = buffer.toString('base64');
  } catch (qrErr) {
    console.error('QR code generation:', qrErr);
    return res.status(500).json({ error: 'Failed to generate QR code.' });
  }

  try {
    const { rows: [existing] } = await pool.query(
      'SELECT id FROM oec_labels WHERE allocation_id = $1 AND tenant_id = $2',
      [allocation_id, tenant_id]
    );

    let label;
    if (existing) {
      const { rows: [updated] } = await pool.query(
        `UPDATE oec_labels SET
           roast_date_start=$1, roast_date_end=$2, ready_to_brew_date=$3,
           best_consumed_by_date=$4, qr_url=$5, qr_code_base64=$6, template_version=$7,
           estate_location=COALESCE($8, estate_location),
           variety=COALESCE($9, variety),
           roast_level=COALESCE($10, roast_level),
           flavour_notes=COALESCE($11, flavour_notes),
           net_weight_g=COALESCE($12, net_weight_g),
           label_image=COALESCE($13, label_image),
           generated_at=NOW(), generated_by=$14, updated_at=NOW(), updated_by=$14
         WHERE id=$15 RETURNING *`,
        [roast_date_start, roast_date_end, ready_to_brew_date, best_consumed_by_date,
         qr_url, qr_code_base64, TEMPLATE_VERSION,
         estate_location || null, variety || null, roast_level || null,
         flavour_notes || null, net_weight_g || null, label_image || null,
         req.user.id, existing.id]
      );
      label = updated;
    } else {
      const { rows: [inserted] } = await pool.query(
        `INSERT INTO oec_labels
           (tenant_id, allocation_id, roast_date_start, roast_date_end, ready_to_brew_date,
            best_consumed_by_date, qr_url, qr_code_base64, template_version,
            estate_location, variety, roast_level, flavour_notes, net_weight_g, label_image,
            generated_by, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16,$16) RETURNING *`,
        [tenant_id, allocation_id, roast_date_start, roast_date_end, ready_to_brew_date,
         best_consumed_by_date, qr_url, qr_code_base64, TEMPLATE_VERSION,
         estate_location || null, variety || null, roast_level || null,
         flavour_notes || null, net_weight_g || null, label_image || null,
         req.user.id]
      );
      label = inserted;
    }

    // Join allocation data for response
    label.allocation_code = alloc.allocation_code;
    label.process         = alloc.process;
    label.harvest_year    = alloc.harvest_year;
    return res.json({ label });
  } catch (err) {
    console.error('Generate label:', err);
    return res.status(500).json({ error: 'Failed to generate label.', detail: err.message });
  }
});

// PUT /api/labels/:id — update label fields
router.put('/:id', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { rows: [label] } = await pool.query(
    `SELECT l.*, a.allocation_code, a.process, a.harvest_year
     FROM oec_labels l
     JOIN oec_allocations a ON a.id = l.allocation_id
     WHERE l.id = $1 AND l.tenant_id = $2`,
    [req.params.id, tenant_id]
  );
  if (!label) return res.status(404).json({ error: 'Label not found.' });

  const sets = [];
  const params = [];
  const push = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };

  const { estate_location, variety, roast_level, flavour_notes, net_weight_g, label_image } = req.body;
  if ('estate_location' in req.body) push('estate_location', estate_location || null);
  if ('variety'         in req.body) push('variety',         variety         || null);
  if ('roast_level'     in req.body) push('roast_level',     roast_level     || null);
  if ('flavour_notes'   in req.body) push('flavour_notes',   flavour_notes   || null);
  if ('net_weight_g'    in req.body) push('net_weight_g',    net_weight_g    || null);
  if ('label_image'     in req.body) push('label_image',     label_image     || null);

  if (sets.length === 0) return res.json({ label });

  params.push(req.user.id); sets.push(`updated_by = $${params.length}`);
  sets.push('updated_at = NOW()');
  params.push(req.params.id);

  try {
    const { rows: [updated] } = await pool.query(
      `UPDATE oec_labels SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    updated.allocation_code = label.allocation_code;
    updated.process         = label.process;
    updated.harvest_year    = label.harvest_year;
    return res.json({ label: updated });
  } catch (err) {
    console.error('Update label:', err);
    return res.status(500).json({ error: 'Failed to update label.' });
  }
});

// DELETE /api/labels/:label_id — hard delete a label
router.delete('/:label_id', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const { rows: [label] } = await pool.query(
      'SELECT id FROM oec_labels WHERE id = $1 AND tenant_id = $2',
      [req.params.label_id, tenant_id]
    );
    if (!label) return res.status(404).json({ error: 'Label not found.' });
    await pool.query('DELETE FROM oec_labels WHERE id = $1', [label.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Delete label:', err);
    return res.status(500).json({ error: 'Failed to delete label.' });
  }
});

// GET /api/labels/:allocation_id — get label for allocation
router.get('/:allocation_id', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const { rows: [label] } = await pool.query(
      `SELECT l.*, a.allocation_code, a.process, a.harvest_year
       FROM oec_labels l
       JOIN oec_allocations a ON a.id = l.allocation_id
       WHERE l.allocation_id = $1 AND l.tenant_id = $2`,
      [req.params.allocation_id, tenant_id]
    );
    if (!label) return res.status(404).json({ error: 'No label generated for this allocation yet.' });
    return res.json({ label });
  } catch (err) {
    console.error('Get label:', err);
    return res.status(500).json({ error: 'Failed to fetch label.' });
  }
});

module.exports = router;
