CREATE TABLE ops.oec_lot_movements (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID              NOT NULL REFERENCES ops.oec_tenants(id),
  lot_id          UUID              NOT NULL REFERENCES ops.oec_lots(id),
  movement_type   ops.movement_type NOT NULL,
  weight_change_g INTEGER           NOT NULL,
  reason          TEXT,
  authorised_by   UUID              REFERENCES ops.oec_users(id),
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  created_by      UUID              REFERENCES ops.oec_users(id)
);

CREATE INDEX ops_idx_oec_lot_movements_lot_id    ON ops.oec_lot_movements(lot_id);
CREATE INDEX ops_idx_oec_lot_movements_tenant_id ON ops.oec_lot_movements(tenant_id);
