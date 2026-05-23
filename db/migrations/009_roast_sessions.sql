CREATE TABLE ops.oec_roast_sessions (
  id                       UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID             NOT NULL REFERENCES ops.oec_tenants(id),
  allocation_id            UUID             REFERENCES ops.oec_allocations(id),
  is_development           BOOLEAN          NOT NULL DEFAULT FALSE,
  batch_code               VARCHAR(50)      NOT NULL UNIQUE,
  green_weight_in_g        INTEGER          NOT NULL CHECK (green_weight_in_g > 0),
  roasted_weight_out_g     INTEGER          CHECK (roasted_weight_out_g > 0),
  charge_temp_c            INTEGER,
  eject_temp_c             INTEGER,
  total_time_seconds       INTEGER          CHECK (total_time_seconds > 0),
  development_time_seconds INTEGER          CHECK (development_time_seconds > 0),
  dtr                      DECIMAL(5,2),
  temperature_curve        JSONB,
  status                   ops.roast_status NOT NULL DEFAULT 'in_progress',
  started_at               TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  ended_at                 TIMESTAMPTZ,
  created_at               TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  created_by               UUID             REFERENCES ops.oec_users(id),
  updated_at               TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_by               UUID             REFERENCES ops.oec_users(id)
);

CREATE INDEX ops_idx_oec_roast_sessions_tenant_id     ON ops.oec_roast_sessions(tenant_id);
CREATE INDEX ops_idx_oec_roast_sessions_allocation_id ON ops.oec_roast_sessions(allocation_id);
CREATE INDEX ops_idx_oec_roast_sessions_status        ON ops.oec_roast_sessions(status);
