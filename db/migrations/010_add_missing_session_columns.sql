-- Add variance_flagged and deleted_at to roast_sessions (missing from initial migration)
ALTER TABLE ops.oec_roast_sessions
  ADD COLUMN IF NOT EXISTS variance_flagged BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Ensure charge_temp_c is not null in new rows (we update existing nulls to 0)
UPDATE ops.oec_roast_sessions SET charge_temp_c = 0 WHERE charge_temp_c IS NULL;

-- Per-tenant allocation sequence table (the existing PostgreSQL sequence is not tenant-aware)
CREATE TABLE IF NOT EXISTS ops.oec_allocation_sequence (
  tenant_id UUID PRIMARY KEY REFERENCES ops.oec_tenants(id),
  next_val  INTEGER NOT NULL DEFAULT 1
);

-- session_notes
CREATE TABLE IF NOT EXISTS ops.oec_session_notes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES ops.oec_tenants(id),
  session_id       UUID NOT NULL REFERENCES ops.oec_roast_sessions(id),
  note_text        TEXT NOT NULL,
  roast_position_s INTEGER NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       UUID NOT NULL REFERENCES ops.oec_users(id)
);

CREATE INDEX IF NOT EXISTS ops_idx_oec_session_notes_session_id
  ON ops.oec_session_notes(session_id);

-- allocation_requests
CREATE TABLE IF NOT EXISTS ops.oec_allocation_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES ops.oec_tenants(id),
  allocation_id  UUID NOT NULL REFERENCES ops.oec_allocations(id),
  contact_name   VARCHAR(255) NOT NULL,
  contact_method VARCHAR(255) NOT NULL,
  channel        VARCHAR(50)  NOT NULL CHECK (channel IN ('WhatsApp','Instagram','Website','In_Person','Other')),
  quantity_bags  INTEGER NOT NULL CHECK (quantity_bags > 0),
  status         VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','fulfilled')),
  notes          TEXT,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID NOT NULL REFERENCES ops.oec_users(id),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by     UUID NOT NULL REFERENCES ops.oec_users(id)
);

CREATE INDEX IF NOT EXISTS ops_idx_oec_allocation_requests_allocation_id
  ON ops.oec_allocation_requests(allocation_id);
CREATE INDEX IF NOT EXISTS ops_idx_oec_allocation_requests_tenant_id
  ON ops.oec_allocation_requests(tenant_id);
