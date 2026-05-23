CREATE TABLE ops.oec_labels (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES ops.oec_tenants(id),
  allocation_id         UUID        NOT NULL REFERENCES ops.oec_allocations(id) UNIQUE,
  roast_date_start      DATE        NOT NULL,
  roast_date_end        DATE        NOT NULL,
  ready_to_brew_date    DATE        NOT NULL,
  best_consumed_by_date DATE        NOT NULL,
  qr_url                TEXT        NOT NULL,
  qr_code_base64        TEXT        NOT NULL,
  template_version      VARCHAR(20) NOT NULL DEFAULT 'v1.0',
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by          UUID        NOT NULL REFERENCES ops.oec_users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID        NOT NULL REFERENCES ops.oec_users(id),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by            UUID        NOT NULL REFERENCES ops.oec_users(id)
);

CREATE INDEX ops_idx_oec_labels_tenant ON ops.oec_labels(tenant_id);
