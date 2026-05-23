CREATE SEQUENCE ops.oec_allocation_code_seq START 1;

CREATE TABLE ops.oec_allocations (
  id                       UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID                  NOT NULL REFERENCES ops.oec_tenants(id),
  allocation_code          VARCHAR(20)           NOT NULL UNIQUE,
  lot_id                   UUID                  NOT NULL REFERENCES ops.oec_lots(id),
  estate                   VARCHAR(255)          NOT NULL,
  process                  ops.lot_process       NOT NULL,
  harvest_year             INTEGER               NOT NULL,
  planned_green_quantity_g INTEGER               NOT NULL CHECK (planned_green_quantity_g > 0),
  planned_bag_size_g       INTEGER               NOT NULL CHECK (planned_bag_size_g > 0),
  planned_price_json       JSONB                 NOT NULL DEFAULT '{}',
  window_open_date         DATE,
  window_close_date        DATE,
  state                    ops.allocation_state  NOT NULL DEFAULT 'upcoming',
  deleted_at               TIMESTAMPTZ,
  created_at               TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  created_by               UUID                  REFERENCES ops.oec_users(id),
  updated_at               TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_by               UUID                  REFERENCES ops.oec_users(id)
);

CREATE INDEX ops_idx_oec_allocations_tenant_active ON ops.oec_allocations(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX ops_idx_oec_allocations_tenant_id     ON ops.oec_allocations(tenant_id);
CREATE INDEX ops_idx_oec_allocations_lot_id        ON ops.oec_allocations(lot_id);
CREATE INDEX ops_idx_oec_allocations_state         ON ops.oec_allocations(state) WHERE deleted_at IS NULL;
