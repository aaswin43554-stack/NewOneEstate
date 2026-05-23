CREATE TABLE ops.oec_lots (
  id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID            NOT NULL REFERENCES ops.oec_tenants(id),
  lot_code         VARCHAR(50)     NOT NULL,
  estate           VARCHAR(255)    NOT NULL,
  process          ops.lot_process NOT NULL,
  harvest_year     INTEGER         NOT NULL,
  arrival_date     DATE            NOT NULL,
  arrival_weight_g INTEGER         NOT NULL CHECK (arrival_weight_g > 0),
  current_weight_g INTEGER         NOT NULL CHECK (current_weight_g >= 0),
  moisture_content DECIMAL(5,2),
  water_activity   DECIMAL(5,3),
  storage_location VARCHAR(255),
  supplier_notes   TEXT,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  created_by       UUID            REFERENCES ops.oec_users(id),
  updated_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_by       UUID            REFERENCES ops.oec_users(id),
  UNIQUE (tenant_id, lot_code)
);

CREATE INDEX ops_idx_oec_lots_tenant_active ON ops.oec_lots(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX ops_idx_oec_lots_tenant_id     ON ops.oec_lots(tenant_id);
