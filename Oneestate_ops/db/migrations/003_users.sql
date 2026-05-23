CREATE TABLE ops.oec_users (
  id            UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID              NOT NULL REFERENCES ops.oec_tenants(id),
  name          VARCHAR(255)      NOT NULL,
  email         VARCHAR(255)      NOT NULL,
  password_hash VARCHAR(255)      NOT NULL,
  role          ops.user_role     NOT NULL DEFAULT 'viewer',
  timezone      VARCHAR(100)      NOT NULL DEFAULT 'Asia/Vientiane',
  created_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  created_by    UUID              REFERENCES ops.oec_users(id),
  updated_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_by    UUID              REFERENCES ops.oec_users(id),
  UNIQUE (tenant_id, email)
);

CREATE INDEX ops_idx_oec_users_tenant_id ON ops.oec_users(tenant_id);
CREATE INDEX ops_idx_oec_users_email     ON ops.oec_users(email);
