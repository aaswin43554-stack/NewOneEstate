const pool = require('../config/db');

const ROAST_LOSS = { Washed: 0.17, Honey: 0.16, Natural: 0.18, Anaerobic: 0.18 };
const REST_DAYS  = { Washed: 4,    Honey: 5,    Natural: 7,    Anaerobic: 7    };

// 4-state lifecycle
const STATE_SEQUENCE = [
  'upcoming',
  'open_for_requests',
  'roasting_in_progress',
  'allocation_closed',
];

function calculateProjectedBags(planned_green_quantity_g, planned_bag_size_g, process) {
  const roast_loss = ROAST_LOSS[process] || 0.17;
  const usable_g   = planned_green_quantity_g - 700;
  const roasted_g  = usable_g * (1 - roast_loss);
  return Math.max(0, Math.floor(roasted_g / planned_bag_size_g));
}

async function calculateDispatchDate(allocation_id, process) {
  const { rows } = await pool.query(
    `SELECT MAX(ended_at) AS max_ended FROM oec_roast_sessions
     WHERE allocation_id = $1 AND is_development = false
       AND status = 'approved_for_bagging' AND deleted_at IS NULL`,
    [allocation_id]
  );
  if (!rows[0] || !rows[0].max_ended) return null;
  const d = new Date(rows[0].max_ended);
  d.setDate(d.getDate() + (REST_DAYS[process] || 7));
  return d.toISOString().split('T')[0];
}

// Must be called inside an existing transaction (pass the client)
async function generateAllocationCode(tenant_id, client) {
  const { rows } = await client.query(
    'SELECT next_val FROM oec_allocation_sequence WHERE tenant_id = $1 FOR UPDATE',
    [tenant_id]
  );

  let next_val;
  if (rows.length === 0) {
    const { rows: existing } = await client.query(
      `SELECT MAX(CAST(regexp_replace(allocation_code, '^[^-]+-', '') AS INTEGER)) AS max_num
       FROM oec_allocations WHERE tenant_id = $1`,
      [tenant_id]
    );
    const max_num = existing[0]?.max_num ?? 0;
    next_val = max_num + 1;
    await client.query(
      'INSERT INTO oec_allocation_sequence (tenant_id, next_val) VALUES ($1, $2)',
      [tenant_id, next_val + 1]
    );
    console.log(`[ALLOC] Bootstrapped sequence for tenant ${tenant_id} — starting at: ${next_val}`);
  } else {
    next_val = rows[0].next_val;
    await client.query(
      'UPDATE oec_allocation_sequence SET next_val = next_val + 1 WHERE tenant_id = $1',
      [tenant_id]
    );
  }

  return 'W-' + String(next_val).padStart(2, '0');
}

function getNextState(current_state) {
  const idx = STATE_SEQUENCE.indexOf(current_state);
  if (idx === -1 || idx === STATE_SEQUENCE.length - 1) return null;
  return STATE_SEQUENCE[idx + 1];
}

async function checkTransitionPreconditions(allocation, to_state, tenant_id) {
  const {
    id: allocation_id, state: from_state, process, lot_id,
    planned_green_quantity_g, planned_bag_size_g,
  } = allocation;
  const checks = [];

  // upcoming → open_for_requests
  if (from_state === 'upcoming' && to_state === 'open_for_requests') {
    const { rows } = await pool.query(
      `SELECT id FROM oec_roast_profiles
       WHERE tenant_id = $1 AND process = $2 AND status = 'approved' AND deleted_at IS NULL
       ORDER BY approved_at DESC LIMIT 1`,
      [tenant_id, process]
    );
    const passed = rows.length > 0;
    checks.push({
      label: 'Approved roast profile',
      passed,
      reason: passed ? null :
        `No approved roast profile exists for ${process}. Create and approve a profile first.`,
    });

    if (lot_id) {
      const { rows: [lotRow] } = await pool.query(
        'SELECT current_weight_g FROM oec_lots WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [lot_id, tenant_id]
      );
      const available = lotRow?.current_weight_g ?? 0;
      checks.push({
        label: 'Green stock available',
        passed: available >= planned_green_quantity_g,
        reason: available >= planned_green_quantity_g ? null :
          `Insufficient green stock. Available: ${available}g, need: ${planned_green_quantity_g}g.`,
      });
    }
  }

  // open_for_requests → roasting_in_progress
  // (absorbs the old "closed → roasting_in_progress" checks)
  if (from_state === 'open_for_requests' && to_state === 'roasting_in_progress') {
    const { rows: reqRows } = await pool.query(
      `SELECT COALESCE(SUM(quantity_bags), 0)::int AS total
       FROM oec_allocation_requests
       WHERE allocation_id = $1 AND status = 'confirmed'`,
      [allocation_id]
    );
    const totalConfirmed = reqRows[0].total;
    checks.push({
      label: 'Confirmed requests',
      passed: totalConfirmed > 0,
      reason: totalConfirmed > 0 ? null :
        'No confirmed requests. Confirm at least one request before starting production.',
    });

    const projected = calculateProjectedBags(planned_green_quantity_g, planned_bag_size_g, process);
    checks.push({
      label: 'Bag count within yield',
      passed: totalConfirmed <= projected,
      reason: totalConfirmed <= projected ? null :
        `Confirmed bags (${totalConfirmed}) exceed projected yield (${projected}).`,
    });

    const { rows: movRows } = await pool.query(
      `SELECT id FROM oec_lot_movements
       WHERE lot_id = $1 AND movement_type = 'reservation'
         AND authorised_by IS NOT NULL LIMIT 1`,
      [lot_id]
    );
    checks.push({
      label: 'Green stock reserved',
      passed: movRows.length > 0,
      reason: movRows.length > 0 ? null :
        'Green stock has not been reserved. Create a reservation movement in Inventory.',
    });
  }

  // roasting_in_progress → allocation_closed: all production sessions bagged
  if (from_state === 'roasting_in_progress' && to_state === 'allocation_closed') {
    const { rows } = await pool.query(
      `SELECT batch_code FROM oec_roast_sessions
       WHERE allocation_id = $1 AND is_development = false
         AND status != 'approved_for_bagging' AND deleted_at IS NULL`,
      [allocation_id]
    );
    const unapproved = rows.map(r => r.batch_code);
    checks.push({
      label: 'All sessions approved for bagging',
      passed: unapproved.length === 0,
      reason: unapproved.length === 0 ? null :
        `Sessions not yet approved for bagging: ${unapproved.join(', ')}`,
    });
  }

  return checks;
}

module.exports = {
  calculateProjectedBags,
  calculateDispatchDate,
  generateAllocationCode,
  getNextState,
  checkTransitionPreconditions,
  STATE_SEQUENCE,
  REST_DAYS,
  ROAST_LOSS,
};
