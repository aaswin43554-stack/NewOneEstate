const express = require('express');
const crypto  = require('crypto');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

// Constant-time secret comparison. Both sides are hashed to a fixed 32 bytes
// first so timingSafeEqual never sees mismatched lengths (which would leak the
// secret's length and throw), and the compare itself is not short-circuited.
function secretMatches(provided, expected) {
  const a = crypto.createHash('sha256').update(String(provided)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}
const {
  calculateProjectedBags, calculateDispatchDate,
  generateAllocationCode, getNextState,
  checkTransitionPreconditions,
} = require('../services/allocationService');
const { validateInts } = require('../utils/validate');

const router = express.Router();

// Request channels accepted by the oec_allocation_requests CHECK constraint.
const ALLOWED_CHANNELS = ['WhatsApp', 'Instagram', 'Website', 'In_Person', 'Other'];

// Map a contact's free-text preferred_channel onto a valid request channel.
// Returns null when there is no confident match so callers can fall back.
function normalizeChannel(raw) {
  if (!raw) return null;
  const key = String(raw).toLowerCase().replace(/[\s_]+/g, '');
  return ALLOWED_CHANNELS.find(c => c.toLowerCase().replace(/[\s_]+/g, '') === key) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/allocations/sync-from-admin  (NO JWT — uses webhook secret auth)
// Must be declared BEFORE router.use(requireAuth) so JWT check is bypassed.
// Called by the One Estate admin whenever an allocation is created/updated.
// Payload: { external_id, allocation_code, estate, process, harvest_year,
//            planned_green_quantity_g, planned_bag_size_g, planned_price_json,
//            window_open_date, window_close_date, state, lot_id, tenant_id }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/sync-from-admin', async (req, res) => {
  const secret = process.env.ONE_ESTATE_WEBHOOK_SECRET;
  const auth   = req.headers['authorization'] || '';
  const token  = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!secret || !token || !secretMatches(token, secret)) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const {
    external_id, allocation_code, estate, process: lotProcess, harvest_year,
    planned_green_quantity_g, planned_bag_size_g, planned_price_json,
    window_open_date, window_close_date, state, lot_id, tenant_id,
  } = req.body;

  if (!external_id || !allocation_code || !estate || !lotProcess || !harvest_year
      || !planned_green_quantity_g || !planned_bag_size_g || !state || !tenant_id) {
    return res.status(400).json({ error: 'Missing required sync fields.' });
  }

  const VALID_STATES = ['upcoming', 'open_for_requests', 'roasting_in_progress', 'allocation_closed'];
  if (!VALID_STATES.includes(state)) {
    return res.status(400).json({ error: `Invalid state: ${state}` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [existing] } = await client.query(
      `SELECT id, state FROM oec_allocations
       WHERE tenant_id = $1 AND external_id = $2 AND deleted_at IS NULL`,
      [tenant_id, external_id]
    );

    let allocation;

    if (existing) {
      const { rows: [updated] } = await client.query(
        `UPDATE oec_allocations SET
           estate = $1, harvest_year = $2,
           planned_green_quantity_g = $3, planned_bag_size_g = $4,
           planned_price_json = $5,
           window_open_date = $6, window_close_date = $7,
           state = $8::ops.allocation_state,
           updated_at = NOW()
         WHERE id = $9 RETURNING *`,
        [
          estate, parseInt(harvest_year),
          parseInt(planned_green_quantity_g), parseInt(planned_bag_size_g),
          JSON.stringify(planned_price_json || {}),
          window_open_date || null, window_close_date || null,
          state, existing.id,
        ]
      );
      if (existing.state !== state) {
        await client.query(
          `INSERT INTO oec_allocation_state_log
             (allocation_id, from_state, to_state, notes)
           VALUES ($1, $2::ops.allocation_state, $3::ops.allocation_state, 'Synced from One Estate admin')`,
          [existing.id, existing.state, state]
        );
      }
      allocation = updated;
    } else {
      const { rows: [created] } = await client.query(
        `INSERT INTO oec_allocations
           (tenant_id, allocation_code, external_id, source, lot_id,
            estate, process, harvest_year,
            planned_green_quantity_g, planned_bag_size_g, planned_price_json,
            window_open_date, window_close_date, state)
         VALUES ($1,$2,$3,'one_estate',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::ops.allocation_state)
         RETURNING *`,
        [
          tenant_id, allocation_code, external_id, lot_id || null,
          estate, lotProcess, parseInt(harvest_year),
          parseInt(planned_green_quantity_g), parseInt(planned_bag_size_g),
          JSON.stringify(planned_price_json || {}),
          window_open_date || null, window_close_date || null,
          state,
        ]
      );
      allocation = created;
    }

    await client.query('COMMIT');
    return res.json({ allocation, action: existing ? 'updated' : 'created' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[ALLOC] sync-from-admin failed:', err.message);
    return res.status(500).json({ error: 'Sync failed.' });
  } finally {
    client.release();
  }
});

// All routes below this line require JWT auth
router.use(requireAuth);

async function fetchAllocation(id, tenant_id) {
  const { rows: [a] } = await pool.query(
    'SELECT * FROM oec_allocations WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [id, tenant_id]
  );
  return a || null;
}

function closedGuard(allocation, res) {
  if (allocation.state === 'allocation_closed') {
    res.status(403).json({ error: 'This allocation is closed and cannot be modified.' });
    return true;
  }
  return false;
}

// POST /api/allocations
router.post('/', requireRole('admin', 'roaster'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const {
    lot_id, lots, estate, process, harvest_year,
    planned_green_quantity_g, planned_bag_size_g,
    planned_price_json, window_open_date, window_close_date,
  } = req.body;

  // An allocation can draw green from one or many lots. Normalise both the
  // legacy single-lot payload ({ lot_id, planned_green_quantity_g }) and the
  // multi-lot payload ({ lots: [{ lot_id, green_quantity_g }] }) into one list.
  let lotList;
  if (Array.isArray(lots) && lots.length > 0) {
    lotList = lots.map(l => ({ lot_id: l.lot_id, green_quantity_g: Number(l.green_quantity_g) }));
  } else if (lot_id && planned_green_quantity_g) {
    lotList = [{ lot_id, green_quantity_g: Number(planned_green_quantity_g) }];
  } else {
    lotList = [];
  }

  if (!lotList.length) {
    return res.status(400).json({ error: 'At least one green lot is required.' });
  }
  for (const l of lotList) {
    if (!l.lot_id) return res.status(400).json({ error: 'Each lot must have a lot_id.' });
    if (!Number.isInteger(l.green_quantity_g) || l.green_quantity_g < 1 || l.green_quantity_g > 2147483647) {
      return res.status(400).json({ error: 'Each lot must have a whole-number green quantity (g) of at least 1.' });
    }
  }
  // Reject the same lot twice — the junction table has a UNIQUE (allocation_id, lot_id).
  const uniqueLotIds = new Set(lotList.map(l => l.lot_id));
  if (uniqueLotIds.size !== lotList.length) {
    return res.status(400).json({ error: 'The same lot cannot be added more than once.' });
  }

  const totalGreenG  = lotList.reduce((sum, l) => sum + l.green_quantity_g, 0);
  const primaryLotId = lotList[0].lot_id;

  if (!estate || !process || !harvest_year || !planned_bag_size_g || !planned_price_json || !window_open_date) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const vCreate = validateInts(req.body, [
    { key: 'harvest_year',       label: 'Harvest year',         min: 1900, max: 2200 },
    { key: 'planned_bag_size_g', label: 'Planned bag size (g)', min: 1 },
  ]);
  if (!vCreate.ok) return res.status(400).json({ error: vCreate.error });

  const closeDate = window_close_date
    ? new Date(window_close_date)
    : (() => { const d = new Date(window_open_date); d.setDate(d.getDate() + 5); return d; })();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify every lot belongs to this tenant (IDOR guard)
    const lotIds = lotList.map(l => l.lot_id);
    const { rows: lotCheck } = await client.query(
      'SELECT id FROM oec_lots WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND deleted_at IS NULL',
      [lotIds, tenant_id]
    );
    if (lotCheck.length !== lotIds.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'One or more lots were not found.' });
    }

    const allocation_code = await generateAllocationCode(tenant_id, client);
    const { rows: [alloc] } = await client.query(
      `INSERT INTO oec_allocations
         (tenant_id, allocation_code, lot_id, estate, process, harvest_year,
          planned_green_quantity_g, planned_bag_size_g, planned_price_json,
          window_open_date, window_close_date, state, source, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'upcoming','manual',$12,$12)
       RETURNING *`,
      [
        tenant_id, allocation_code, primaryLotId, estate, process, parseInt(harvest_year),
        totalGreenG, parseInt(planned_bag_size_g),
        JSON.stringify(planned_price_json),
        window_open_date, closeDate.toISOString().split('T')[0],
        req.user.id,
      ]
    );

    for (const l of lotList) {
      await client.query(
        `INSERT INTO oec_allocation_lots (tenant_id, allocation_id, lot_id, green_quantity_g)
         VALUES ($1, $2, $3, $4)`,
        [tenant_id, alloc.id, l.lot_id, l.green_quantity_g]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({ allocation: alloc });
  } catch (err) {
    await client.query('ROLLBACK').catch((rbErr) => {
      console.error(`[ALLOC] Rollback failed: ${rbErr.message}`);
    });
    console.error(`[ALLOC][ALLOC_CREATE_001] Create allocation failed for tenant ${tenant_id}`);
    console.error(`[ALLOC][ALLOC_CREATE_001] pg code: ${err.code || 'N/A'} | message: ${err.message}`);
    return res.status(500).json({ error: 'Failed to create allocation.', code: 'ALLOC_CREATE_001' });
  } finally {
    client.release();
  }
});

// PUT /api/allocations/:id
router.put('/:id', requireRole('admin', 'roaster'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const alloc = await fetchAllocation(req.params.id, tenant_id);
  if (!alloc) return res.status(404).json({ error: 'Allocation not found.' });
  if (closedGuard(alloc, res)) return;
  if (alloc.state === 'roasting_in_progress') {
    return res.status(400).json({ error: 'Cannot edit core fields while roasting is in progress.' });
  }

  const { estate, planned_green_quantity_g, planned_bag_size_g, planned_price_json, window_open_date, window_close_date } = req.body;

  const vEdit = validateInts(req.body, [
    { key: 'planned_green_quantity_g', label: 'Planned green quantity (g)', min: 1 },
    { key: 'planned_bag_size_g',       label: 'Planned bag size (g)',       min: 1 },
  ]);
  if (!vEdit.ok) return res.status(400).json({ error: vEdit.error });

  try {
    const { rows: [updated] } = await pool.query(
      `UPDATE oec_allocations SET
         estate = COALESCE($1, estate),
         planned_green_quantity_g = COALESCE($2, planned_green_quantity_g),
         planned_bag_size_g = COALESCE($3, planned_bag_size_g),
         planned_price_json = COALESCE($4, planned_price_json),
         window_open_date = COALESCE($5, window_open_date),
         window_close_date = COALESCE($6, window_close_date),
         updated_at = NOW(), updated_by = $7
       WHERE id = $8 RETURNING *`,
      [
        estate || null,
        planned_green_quantity_g ? parseInt(planned_green_quantity_g) : null,
        planned_bag_size_g ? parseInt(planned_bag_size_g) : null,
        planned_price_json ? JSON.stringify(planned_price_json) : null,
        window_open_date || null,
        window_close_date || null,
        req.user.id,
        alloc.id,
      ]
    );
    return res.json({ allocation: updated });
  } catch (err) {
    console.error('Update allocation:', err);
    return res.status(500).json({ error: 'Failed to update allocation.' });
  }
});

// PUT /api/allocations/:id/transition
router.put('/:id/transition', requireRole('admin', 'roaster'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const alloc = await fetchAllocation(req.params.id, tenant_id);
  if (!alloc) return res.status(404).json({ error: 'Allocation not found.' });
  if (closedGuard(alloc, res)) return;

  const next_state = getNextState(alloc.state);
  if (!next_state) {
    return res.status(400).json({ error: `No further states from '${alloc.state}'.` });
  }

  const checks = await checkTransitionPreconditions(alloc, next_state, tenant_id);
  const failed = checks.filter(c => !c.passed);
  if (failed.length > 0) {
    return res.status(400).json({ error: failed[0].reason, checks });
  }

  const { notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Auto-reserve green stock when opening for requests (skip lots already reserved).
    // An allocation may span several lots — reserve each lot's share independently.
    if (next_state === 'open_for_requests') {
      const { rows: allocLots } = await client.query(
        'SELECT lot_id, green_quantity_g FROM oec_allocation_lots WHERE allocation_id = $1',
        [alloc.id]
      );
      // Fall back to the legacy single-lot column for allocations created before
      // the junction table existed (e.g. synced from the One Estate admin).
      const lotsToReserve = allocLots.length > 0
        ? allocLots
        : (alloc.lot_id ? [{ lot_id: alloc.lot_id, green_quantity_g: alloc.planned_green_quantity_g }] : []);

      const reason = `Auto-reserved for allocation ${alloc.allocation_code}`;
      for (const { lot_id, green_quantity_g } of lotsToReserve) {
        const { rows: existing } = await client.query(
          `SELECT id FROM oec_lot_movements
           WHERE lot_id = $1 AND movement_type = 'reservation' AND reason = $2`,
          [lot_id, reason]
        );
        if (existing.length > 0) continue;

        const { rows: [lot] } = await client.query(
          'SELECT current_weight_g FROM oec_lots WHERE id = $1 FOR UPDATE',
          [lot_id]
        );
        const newWeight = lot.current_weight_g - green_quantity_g;
        if (newWeight < 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Insufficient green stock to reserve.' });
        }
        await client.query(
          'UPDATE oec_lots SET current_weight_g = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3',
          [newWeight, req.user.id, lot_id]
        );
        await client.query(
          `INSERT INTO oec_lot_movements
             (tenant_id, lot_id, movement_type, weight_change_g, reason, authorised_by, created_by)
           VALUES ($1, $2, 'reservation', $3, $4, $5, $5)`,
          [tenant_id, lot_id, -green_quantity_g, reason, req.user.id]
        );
      }
    }

    const { rows: [updated] } = await client.query(
      `UPDATE oec_allocations SET state = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3 RETURNING *`,
      [next_state, req.user.id, alloc.id]
    );
    await client.query(
      `INSERT INTO oec_allocation_state_log
         (allocation_id, from_state, to_state, transitioned_by, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [alloc.id, alloc.state, next_state, req.user.id, notes || null]
    );
    await client.query('COMMIT');
    return res.json({ allocation: updated });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Transition allocation:', err);
    return res.status(500).json({ error: 'Failed to transition allocation.' });
  } finally {
    client.release();
  }
});

// PUT /api/allocations/:id/archive
router.put('/:id/archive', requireRole('admin'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const alloc = await fetchAllocation(req.params.id, tenant_id);
  if (!alloc) return res.status(404).json({ error: 'Allocation not found.' });
  if (alloc.state !== 'allocation_closed') {
    return res.status(400).json({ error: 'Only closed allocations can be archived.' });
  }
  if (alloc.archived_at) {
    return res.status(400).json({ error: 'Allocation is already archived.' });
  }
  try {
    const { rows: [updated] } = await pool.query(
      `UPDATE oec_allocations SET archived_at = NOW(), updated_at = NOW(), updated_by = $1 WHERE id = $2 RETURNING *`,
      [req.user.id, alloc.id]
    );
    return res.json({ allocation: updated });
  } catch (err) {
    console.error('Archive allocation:', err);
    return res.status(500).json({ error: 'Failed to archive allocation.' });
  }
});

// PUT /api/allocations/:id/unarchive
router.put('/:id/unarchive', requireRole('admin'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const alloc = await fetchAllocation(req.params.id, tenant_id);
  if (!alloc) return res.status(404).json({ error: 'Allocation not found.' });
  if (!alloc.archived_at) {
    return res.status(400).json({ error: 'Allocation is not archived.' });
  }
  try {
    const { rows: [updated] } = await pool.query(
      `UPDATE oec_allocations SET archived_at = NULL, updated_at = NOW(), updated_by = $1 WHERE id = $2 RETURNING *`,
      [req.user.id, alloc.id]
    );
    return res.json({ allocation: updated });
  } catch (err) {
    console.error('Unarchive allocation:', err);
    return res.status(500).json({ error: 'Failed to unarchive allocation.' });
  }
});

// GET /api/allocations/:id/transition-check
router.get('/:id/transition-check', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const alloc = await fetchAllocation(req.params.id, tenant_id);
  if (!alloc) return res.status(404).json({ error: 'Allocation not found.' });

  const next_state = getNextState(alloc.state);
  if (!next_state) {
    return res.json({ current_state: alloc.state, next_state: null, checks: [] });
  }

  const checks = await checkTransitionPreconditions(alloc, next_state, tenant_id);
  return res.json({ current_state: alloc.state, next_state, checks });
});

// POST /api/allocations/:id/requests
router.post('/:id/requests', requireRole('admin', 'roaster'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const alloc = await fetchAllocation(req.params.id, tenant_id);
  if (!alloc) return res.status(404).json({ error: 'Allocation not found.' });
  if (closedGuard(alloc, res)) return;

  // Requests can be added while open, or by admin after roasting has started
  const canAddRequest = alloc.state === 'open_for_requests' ||
    (alloc.state === 'roasting_in_progress' && req.user.role === 'admin');
  if (!canAddRequest) {
    return res.status(400).json({
      error: 'Requests can only be added while Open for Requests, or by an admin during Roasting.',
    });
  }

  let { contact_id, contact_name, contact_method, channel, quantity_bags, notes } = req.body;

  // Preferred flow: a contact is pulled from the Contacts list. Derive the
  // name / method / channel from that record so they are always consistent.
  if (contact_id) {
    const { rows: [contact] } = await pool.query(
      'SELECT * FROM oec_contacts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [contact_id, tenant_id]
    );
    if (!contact) return res.status(404).json({ error: 'Selected contact not found.' });
    contact_name   = contact.name;
    contact_method = contact.primary_contact_method || contact_method || '—';
    channel        = normalizeChannel(contact.preferred_channel) || channel || 'Other';
  }

  // Validate the bag count up-front. A non-integer or out-of-range value (e.g. a
  // phone number typed into the field) would otherwise overflow the INTEGER
  // column and surface as an opaque "Failed to add request" 500.
  const bags = Number(quantity_bags);
  if (!Number.isInteger(bags) || bags < 1 || bags > 1000000) {
    return res.status(400).json({ error: 'Number of bags must be a whole number between 1 and 1,000,000.' });
  }

  if (!contact_name || !contact_method || !channel) {
    return res.status(400).json({ error: 'A contact (name, method, channel) and quantity_bags are required.' });
  }
  if (!ALLOWED_CHANNELS.includes(channel)) channel = 'Other';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [request] } = await client.query(
      `INSERT INTO oec_allocation_requests
         (tenant_id, allocation_id, contact_name, contact_method, channel, quantity_bags, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,
      [tenant_id, alloc.id, contact_name, contact_method, channel, bags, notes || null, req.user.id]
    );
    // Link the request back to the contact so it shows in their purchase history.
    if (contact_id) {
      await client.query(
        `INSERT INTO oec_contact_request_links (tenant_id, contact_id, allocation_request_id, created_by)
         VALUES ($1,$2,$3,$4) ON CONFLICT (contact_id, allocation_request_id) DO NOTHING`,
        [tenant_id, contact_id, request.id, req.user.id]
      );
    }
    await client.query('COMMIT');
    return res.status(201).json({ request });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Add request:', err);
    return res.status(500).json({ error: 'Failed to add request.' });
  } finally {
    client.release();
  }
});

// PUT /api/allocations/:id/requests/:req_id
router.put('/:id/requests/:req_id', requireRole('admin', 'roaster'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const alloc = await fetchAllocation(req.params.id, tenant_id);
  if (!alloc) return res.status(404).json({ error: 'Allocation not found.' });
  if (closedGuard(alloc, res)) return;

  const { rows: [request] } = await pool.query(
    'SELECT * FROM oec_allocation_requests WHERE id = $1 AND allocation_id = $2',
    [req.params.req_id, alloc.id]
  );
  if (!request) return res.status(404).json({ error: 'Request not found.' });

  const { status: newStatus, quantity_bags, contact_name, channel, notes } = req.body;

  if (!newStatus && (quantity_bags !== undefined || contact_name !== undefined || channel !== undefined || notes !== undefined)) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can edit request fields.' });
    const updates = [];
    const params  = [];
    if (quantity_bags !== undefined) { params.push(parseInt(quantity_bags)); updates.push(`quantity_bags = $${params.length}`); }
    if (contact_name  !== undefined) { params.push(contact_name);            updates.push(`contact_name = $${params.length}`);  }
    if (channel       !== undefined) { params.push(channel);                 updates.push(`channel = $${params.length}`);       }
    if (notes         !== undefined) { params.push(notes || null);           updates.push(`notes = $${params.length}`);         }
    params.push(req.user.id); updates.push(`updated_by = $${params.length}`, 'updated_at = NOW()');
    params.push(request.id);
    try {
      const { rows: [updated] } = await pool.query(
        `UPDATE oec_allocation_requests SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
      );
      return res.json({ request: updated });
    } catch (err) {
      console.error('Edit request fields:', err);
      return res.status(500).json({ error: 'Failed to update request.' });
    }
  }

  const allowed = { pending: ['confirmed'], confirmed: ['fulfilled'] };
  if (!allowed[request.status] || !allowed[request.status].includes(newStatus)) {
    return res.status(400).json({ error: `Cannot transition from '${request.status}' to '${newStatus}'.` });
  }

  if (newStatus === 'confirmed') {
    const { rows: [agg] } = await pool.query(
      `SELECT COALESCE(SUM(quantity_bags), 0)::int AS total
       FROM oec_allocation_requests
       WHERE allocation_id = $1 AND status = 'confirmed' AND id != $2`,
      [alloc.id, request.id]
    );
    const newTotal = agg.total + request.quantity_bags;
    const projected = calculateProjectedBags(
      alloc.planned_green_quantity_g, alloc.planned_bag_size_g, alloc.process
    );
    if (newTotal > projected) {
      return res.status(400).json({
        error: `Confirming this would bring total to ${newTotal} bags, exceeding projected yield of ${projected} bags.`,
      });
    }
  }

  try {
    const { rows: [updated] } = await pool.query(
      `UPDATE oec_allocation_requests SET status = $1, updated_at = NOW(), updated_by = $2
       WHERE id = $3 RETURNING *`,
      [newStatus, req.user.id, request.id]
    );
    return res.json({ request: updated });
  } catch (err) {
    console.error('Update request:', err);
    return res.status(500).json({ error: 'Failed to update request.' });
  }
});

// DELETE /api/allocations/:id  (soft delete, admin only)
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const alloc = await fetchAllocation(req.params.id, tenant_id);
  if (!alloc) return res.status(404).json({ error: 'Allocation not found.' });
  try {
    await pool.query(
      'UPDATE oec_allocations SET deleted_at = NOW(), updated_at = NOW(), updated_by = $1 WHERE id = $2',
      [req.user.id, alloc.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('Delete allocation:', err);
    return res.status(500).json({ error: 'Failed to delete allocation.' });
  }
});

// GET /api/allocations
router.get('/', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { state, process, include_archived } = req.query;

  const params = [tenant_id];
  const conditions = ['a.tenant_id = $1', 'a.deleted_at IS NULL'];
  if (!include_archived || include_archived === 'false') {
    conditions.push('a.archived_at IS NULL');
  }
  if (state)   { params.push(state);   conditions.push(`a.state = $${params.length}`); }
  if (process) { params.push(process); conditions.push(`a.process = $${params.length}`); }

  try {
    const { rows } = await pool.query(
      `SELECT a.*,
              l.lot_code,
              req.confirmed_bags,
              req.pending_bags,
              req.fulfilled_bags,
              req.total_requests,
              disp.max_ended
       FROM oec_allocations a
       LEFT JOIN oec_lots l ON l.id = a.lot_id
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(SUM(CASE WHEN r.status='confirmed'  THEN r.quantity_bags ELSE 0 END),0)::int AS confirmed_bags,
           COALESCE(SUM(CASE WHEN r.status='pending'    THEN r.quantity_bags ELSE 0 END),0)::int AS pending_bags,
           COALESCE(SUM(CASE WHEN r.status='fulfilled'  THEN r.quantity_bags ELSE 0 END),0)::int AS fulfilled_bags,
           COUNT(*)::int AS total_requests
         FROM oec_allocation_requests r
         WHERE r.allocation_id = a.id
       ) req ON true
       LEFT JOIN LATERAL (
         SELECT MAX(ended_at) AS max_ended
         FROM oec_roast_sessions
         WHERE allocation_id = a.id
           AND is_development = false
           AND status = 'approved_for_bagging'
           AND deleted_at IS NULL
       ) disp ON true
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.allocation_code ASC`,
      params
    );

    const REST_DAYS = { Washed: 4, Honey: 5, Natural: 7, Anaerobic: 7 };
    const allocations = rows.map((a) => {
      let dispatch_date = null;
      if (a.max_ended) {
        const d = new Date(a.max_ended);
        d.setDate(d.getDate() + (REST_DAYS[a.process] || 7));
        dispatch_date = d.toISOString().split('T')[0];
      }
      return {
        ...a,
        max_ended: undefined,
        projected_bags: calculateProjectedBags(a.planned_green_quantity_g, a.planned_bag_size_g, a.process),
        dispatch_date,
        request_summary: {
          total_requests: a.total_requests,
          confirmed_bags: a.confirmed_bags,
          pending_bags:   a.pending_bags,
          fulfilled_bags: a.fulfilled_bags,
        },
      };
    });

    return res.json({ allocations });
  } catch (err) {
    console.error('List allocations:', err);
    return res.status(500).json({ error: 'Failed to fetch allocations.' });
  }
});

// GET /api/allocations/:id
router.get('/:id', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const alloc = await fetchAllocation(req.params.id, tenant_id);
  if (!alloc) return res.status(404).json({ error: 'Allocation not found.' });

  const [
    { rows: requests },
    { rows: stateLogs },
    { rows: sessions },
    { rows: [lotRow] },
    { rows: allocLots },
  ] = await Promise.all([
    pool.query(
      'SELECT * FROM oec_allocation_requests WHERE allocation_id = $1 ORDER BY requested_at ASC',
      [alloc.id]
    ),
    pool.query(
      `SELECT l.*, u.name AS transitioned_by_name
       FROM oec_allocation_state_log l
       LEFT JOIN oec_users u ON u.id = l.transitioned_by
       WHERE l.allocation_id = $1 ORDER BY l.transitioned_at ASC`,
      [alloc.id]
    ),
    pool.query(
      `SELECT id, batch_code, status, started_at, ended_at, eject_temp_c, variance_flagged, dtr
       FROM oec_roast_sessions
       WHERE allocation_id = $1 AND is_development = false AND deleted_at IS NULL`,
      [alloc.id]
    ),
    pool.query(
      'SELECT id, lot_code, estate, process, harvest_year, current_weight_g FROM oec_lots WHERE id = $1',
      [alloc.lot_id]
    ),
    pool.query(
      `SELECT al.lot_id, al.green_quantity_g,
              l.lot_code, l.estate, l.process, l.harvest_year, l.current_weight_g
       FROM oec_allocation_lots al
       JOIN oec_lots l ON l.id = al.lot_id
       WHERE al.allocation_id = $1
       ORDER BY al.created_at ASC`,
      [alloc.id]
    ),
  ]);

  const { rows: [aggRow] } = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN status='confirmed' THEN quantity_bags ELSE 0 END),0)::int AS confirmed_bags
     FROM oec_allocation_requests WHERE allocation_id = $1`,
    [alloc.id]
  );

  // Fall back to the legacy single-lot column for allocations created before
  // the junction table existed (or synced from the One Estate admin).
  const lots = allocLots.length > 0
    ? allocLots
    : (lotRow ? [{ ...lotRow, lot_id: lotRow.id, green_quantity_g: alloc.planned_green_quantity_g }] : []);

  return res.json({
    allocation: alloc,
    lot: lotRow || null,
    lots,
    requests,
    state_log: stateLogs,
    roast_sessions: sessions,
    dispatch_date: await calculateDispatchDate(alloc.id, alloc.process),
    projected_bags: calculateProjectedBags(alloc.planned_green_quantity_g, alloc.planned_bag_size_g, alloc.process),
    confirmed_bags: aggRow.confirmed_bags,
  });
});

module.exports = router;
