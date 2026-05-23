CREATE TABLE ops.oec_allocation_state_log (
  id              UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id   UUID                  NOT NULL REFERENCES ops.oec_allocations(id),
  from_state      ops.allocation_state,
  to_state        ops.allocation_state  NOT NULL,
  transitioned_by UUID                  REFERENCES ops.oec_users(id),
  transitioned_at TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  notes           TEXT
);

CREATE INDEX ops_idx_oec_alloc_state_log_alloc_id ON ops.oec_allocation_state_log(allocation_id);
