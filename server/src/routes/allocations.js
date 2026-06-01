const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  calculateProjectedBags, calculateDispatchDate,
  generateAllocationCode, getNextState,
  checkTransitionPreconditions,
} = require('../services/allocationService');

const router = express.Router();
router.use(requireAuth);

async function fetchAllocation(id, tenant_id) {
  const { rows: [a] } = await pool.query(
    'SELECT * FROM oec_allocations WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [id, tenant_id]
  );
  return a || null;
}

function archivedGuard(allocation, res) {
  if (allocation.state === 'archived') {
    res.status(403).json({ error: 'This allocation is archived and cannot be modified. The record is sealed.' });
    return true;
  }
  return false;
}

const STATES_AFTER_CLOSED = ['roasting_in_progress', 'resting', 'dispatched', 'archived'];

// POST /api/allocations
router.post('/', requireRole('admin', 'roaster'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const {
    lot_id, estate, process, harvest_year,
    planned_green_quantity_g, planned_bag_size_g,
    planned_price_json, window_open_date, window_close_date,
  } = req.body;

  if (!lot_id || !estate || !process || !harvest_year || !planned_green_quantity_g || !planned_bag_size_g || !planned_price_json || !window_open_date) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const closeDate = window_close_date
    ? new Date(window_close_date)
    : (() => { const d = new Date(window_open_date); d.setDate(d.getDate() + 5); return d; })();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const allocation_code = await generateAllocationCode(tenant_id, client);
    const { rows: [alloc] } = await client.query(
      `INSERT INTO oec_allocations
         (tenant_id, allocation_code, lot_id, estate, process, harvest_year,
          planned_green_quantity_g, planned_bag_size_g, planned_price_json,
          window_open_date, window_close_date, state, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'upcoming',$12,$12)
       RETURNING *`,
      [
        tenant_id, allocation_code, lot_id, estate, process, parseInt(harvest_year),
        parseInt(planned_green_quantity_g), parseInt(planned_bag_size_g),
        JSON.stringify(planned_price_json),
        window_open_date, closeDate.toISOString().split('T')[0],
        req.user.id,
      ]
    );
    await client.query('COMMIT');
    return res.status(201).json({ allocation: alloc });
  } catch (err) {
    await client.query('ROLLBACK').catch((rbErr) => {
      console.error(`[ALLOC] Rollback failed: ${rbErr.message}`);
    });
    console.error(`[ALLOC][ALLOC_CREATE_001] Create allocation failed for tenant ${tenant_id}`);
    console.error(`[ALLOC][ALLOC_CREATE_001] pg code: ${err.code || 'N/A'} | message: ${err.message}`);
    console.error(`[ALLOC][ALLOC_CREATE_001] body: ${JSON.stringify(req.body)}`);
    console.error(err.stack);
    return res.status(500).json({ error: 'Failed to create allocation.', detail: err.message, code: 'ALLOC_CREATE_001' });
  } finally {
    client.release();
  }
});

// PUT /api/allocations/:id
router.put('/:id', requireRole('admin', 'roaster'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const alloc = await fetchAllocation(req.params.id, tenant_id);
  if (!alloc) return res.status(404).json({ error: 'Allocation not found.' });
  if (archivedGuard(alloc, res)) return;
  if (['closed', ...STATES_AFTER_CLOSED].includes(alloc.state)) {
    return res.status(400).json({ error: 'Cannot edit after allocation is closed.' });
  }

  const { estate, planned_green_quantity_g, planned_bag_size_g, planned_price_json, window_open_date, window_close_date } = req.body;

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
  if (archivedGuard(alloc, res)) return;

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

    // Auto-reserve green stock when opening for requests (skip if already reserved)
    if (next_state === 'open_for_requests' && alloc.lot_id) {
      const { rows: existing } = await client.query(
        `SELECT id FROM oec_lot_movements
         WHERE lot_id = $1 AND movement_type = 'reservation'
           AND reason = $2`,
        [alloc.lot_id, `Auto-reserved for allocation ${alloc.allocation_code}`]
      );
      if (existing.length === 0) {
        const { rows: [lot] } = await client.query(
          'SELECT current_weight_g FROM oec_lots WHERE id = $1 FOR UPDATE',
          [alloc.lot_id]
        );
        const newWeight = lot.current_weight_g - alloc.planned_green_quantity_g;
        if (newWeight < 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Insufficient green stock to reserve.' });
        }
        await client.query(
          'UPDATE oec_lots SET current_weight_g = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3',
          [newWeight, req.user.id, alloc.lot_id]
        );
        await client.query(
          `INSERT INTO oec_lot_movements
             (tenant_id, lot_id, movement_type, weight_change_g, reason, authorised_by, created_by)
           VALUES ($1, $2, 'reservation', $3, $4, $5, $5)`,
          [tenant_id, alloc.lot_id, -alloc.planned_green_quantity_g,
           `Auto-reserved for allocation ${alloc.allocation_code}`, req.user.id]
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
  if (archivedGuard(alloc, res)) return;
  const canAddRequest = alloc.state === 'open_for_requests' ||
    (alloc.state === 'closed' && req.user.role === 'admin');
  if (!canAddRequest) {
    return res.status(400).json({ error: 'Requests can only be added while open, or by an admin when closed.' });
  }

  const { contact_name, contact_method, channel, quantity_bags, notes } = req.body;
  if (!contact_name || !contact_method || !channel || !quantity_bags) {
    return res.status(400).json({ error: 'contact_name, contact_method, channel, and quantity_bags are required.' });
  }

  try {
    const { rows: [request] } = await pool.query(
      `INSERT INTO oec_allocation_requests
         (tenant_id, allocation_id, contact_name, contact_method, channel, quantity_bags, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,
      [tenant_id, alloc.id, contact_name, contact_method, channel, parseInt(quantity_bags), notes || null, req.user.id]
    );
    return res.status(201).json({ request });
  } catch (err) {
    console.error('Add request:', err);
    return res.status(500).json({ error: 'Failed to add request.' });
  }
});

// PUT /api/allocations/:id/requests/:req_id
router.put('/:id/requests/:req_id', requireRole('admin', 'roaster'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const alloc = await fetchAllocation(req.params.id, tenant_id);
  if (!alloc) return res.status(404).json({ error: 'Allocation not found.' });
  if (archivedGuard(alloc, res)) return;

  const { rows: [request] } = await pool.query(
    'SELECT * FROM oec_allocation_requests WHERE id = $1 AND allocation_id = $2',
    [req.params.req_id, alloc.id]
  );
  if (!request) return res.status(404).json({ error: 'Request not found.' });

  const { status: newStatus } = req.body;
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

// GET /api/allocations
router.get('/', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { state, process } = req.query;

  const params = [tenant_id];
  const conditions = ['a.tenant_id = $1', 'a.deleted_at IS NULL'];
  if (state)   { params.push(state);   conditions.push(`a.state = $${params.length}`); }
  if (process) { params.push(process); conditions.push(`a.process = $${params.length}`); }

  try {
    // Single query: all allocations + request counts + dispatch date in one round-trip.
    // The dispatch_date subquery replaces the N+1 calculateDispatchDate loop.
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
      `SELECT batch_code, status, started_at, ended_at, eject_temp_c, variance_flagged, dtr
       FROM oec_roast_sessions
       WHERE allocation_id = $1 AND is_development = false AND deleted_at IS NULL`,
      [alloc.id]
    ),
    pool.query(
      'SELECT id, lot_code, estate, process, harvest_year, current_weight_g FROM oec_lots WHERE id = $1',
      [alloc.lot_id]
    ),
  ]);

  const { rows: [aggRow] } = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN status='confirmed' THEN quantity_bags ELSE 0 END),0)::int AS confirmed_bags
     FROM oec_allocation_requests WHERE allocation_id = $1`,
    [alloc.id]
  );

  return res.json({
    allocation: alloc,
    lot: lotRow || null,
    requests,
    state_log: stateLogs,
    roast_sessions: sessions,
    dispatch_date: await calculateDispatchDate(alloc.id, alloc.process),
    projected_bags: calculateProjectedBags(alloc.planned_green_quantity_g, alloc.planned_bag_size_g, alloc.process),
    confirmed_bags: aggRow.confirmed_bags,
  });
});

module.exports = router;
