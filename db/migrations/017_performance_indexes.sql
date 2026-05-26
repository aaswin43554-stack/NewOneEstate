-- FK columns used in correlated subqueries and JOINs — critical for query speed.
-- Without these, every allocation list / detail page does full table scans.

-- oec_allocation_requests: queried by allocation_id on every allocation list row (4 subqueries × N rows)
CREATE INDEX IF NOT EXISTS idx_alloc_requests_allocation_id
  ON ops.oec_allocation_requests(allocation_id);

CREATE INDEX IF NOT EXISTS idx_alloc_requests_tenant_status
  ON ops.oec_allocation_requests(tenant_id, status);

-- oec_roast_sessions: queried by allocation_id for dispatch-date calculation (N+1 per allocation row)
CREATE INDEX IF NOT EXISTS idx_roast_sessions_allocation_id
  ON ops.oec_roast_sessions(allocation_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_roast_sessions_tenant
  ON ops.oec_roast_sessions(tenant_id) WHERE deleted_at IS NULL;

-- oec_allocations: tenant filter on every list page
CREATE INDEX IF NOT EXISTS idx_allocations_tenant_active
  ON ops.oec_allocations(tenant_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_allocations_state
  ON ops.oec_allocations(state) WHERE deleted_at IS NULL;

-- oec_lots: tenant filter on every inventory page
CREATE INDEX IF NOT EXISTS idx_lots_tenant_active
  ON ops.oec_lots(tenant_id) WHERE deleted_at IS NULL;

-- oec_lot_movements: queried by lot_id on every lot detail / transition check
CREATE INDEX IF NOT EXISTS idx_lot_movements_lot_id
  ON ops.oec_lot_movements(lot_id);

-- oec_allocation_state_log: queried by allocation_id in every detail view
CREATE INDEX IF NOT EXISTS idx_alloc_state_log_allocation_id
  ON ops.oec_allocation_state_log(allocation_id);

-- oec_cupping_samples: queried by cupping_session_id on every cupping detail
CREATE INDEX IF NOT EXISTS idx_cupping_samples_session_id
  ON ops.oec_cupping_samples(cupping_session_id);

-- oec_cupping_sessions: tenant filter
CREATE INDEX IF NOT EXISTS idx_cupping_sessions_tenant
  ON ops.oec_cupping_sessions(tenant_id) WHERE deleted_at IS NULL;

-- oec_roast_profiles: tenant + process filter (used in transition precondition check)
CREATE INDEX IF NOT EXISTS idx_roast_profiles_tenant_process
  ON ops.oec_roast_profiles(tenant_id, process) WHERE deleted_at IS NULL;

-- oec_contacts: tenant filter
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_active
  ON ops.oec_contacts(tenant_id) WHERE deleted_at IS NULL;
