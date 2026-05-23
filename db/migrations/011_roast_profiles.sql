CREATE TABLE ops.oec_roast_profiles (
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID            NOT NULL REFERENCES ops.oec_tenants(id),
  estate              VARCHAR(255)    NOT NULL,
  process             ops.lot_process NOT NULL,
  harvest_year        INTEGER         NOT NULL,
  charge_temp_c       INTEGER         NOT NULL,
  target_dtr          NUMERIC(5,2)    NOT NULL,
  eject_temp_c        INTEGER         NOT NULL,
  total_time_target_s INTEGER         NOT NULL,
  flavour_target      TEXT            NOT NULL,
  status              VARCHAR(30)     NOT NULL DEFAULT 'development'
                      CHECK (status IN ('development','pending_approval','approved','retired')),
  parent_profile_id   UUID            REFERENCES ops.oec_roast_profiles(id),
  approved_at         TIMESTAMPTZ,
  approved_by         UUID            REFERENCES ops.oec_users(id),
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  created_by          UUID            NOT NULL REFERENCES ops.oec_users(id),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_by          UUID            NOT NULL REFERENCES ops.oec_users(id),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX ops_idx_oec_roast_profiles_tenant
  ON ops.oec_roast_profiles(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX ops_idx_oec_roast_profiles_process
  ON ops.oec_roast_profiles(tenant_id, process) WHERE deleted_at IS NULL;
CREATE INDEX ops_idx_oec_roast_profiles_approved
  ON ops.oec_roast_profiles(tenant_id, process, status) WHERE deleted_at IS NULL;
