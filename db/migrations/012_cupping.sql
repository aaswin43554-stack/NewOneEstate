CREATE TABLE ops.oec_cupping_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES ops.oec_tenants(id),
  cupping_date    DATE        NOT NULL,
  days_off_roast  INTEGER     NOT NULL,
  cupping_purpose VARCHAR(30) NOT NULL CHECK (cupping_purpose IN ('development','quality_check','comparative')),
  session_notes   TEXT,
  early_warning   BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID        NOT NULL REFERENCES ops.oec_users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID        NOT NULL REFERENCES ops.oec_users(id),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE ops.oec_cupping_samples (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES ops.oec_tenants(id),
  cupping_session_id UUID        NOT NULL REFERENCES ops.oec_cupping_sessions(id),
  roast_session_id   UUID        NOT NULL REFERENCES ops.oec_roast_sessions(id),
  score_aroma        INTEGER     NOT NULL CHECK (score_aroma BETWEEN 0 AND 10),
  score_flavour      INTEGER     NOT NULL CHECK (score_flavour BETWEEN 0 AND 10),
  score_acidity      INTEGER     NOT NULL CHECK (score_acidity BETWEEN 0 AND 10),
  score_body         INTEGER     NOT NULL CHECK (score_body BETWEEN 0 AND 10),
  score_sweetness    INTEGER     NOT NULL CHECK (score_sweetness BETWEEN 0 AND 10),
  score_aftertaste   INTEGER     NOT NULL CHECK (score_aftertaste BETWEEN 0 AND 10),
  score_overall      INTEGER     NOT NULL CHECK (score_overall BETWEEN 0 AND 10),
  obs_aroma          TEXT,
  obs_flavour        TEXT,
  obs_acidity        TEXT,
  obs_body           TEXT,
  obs_sweetness      TEXT,
  obs_aftertaste     TEXT,
  obs_overall        TEXT,
  final_decision     VARCHAR(20) NOT NULL CHECK (final_decision IN ('adjust','approve','reject')),
  journal_draft      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         UUID        NOT NULL REFERENCES ops.oec_users(id),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by         UUID        NOT NULL REFERENCES ops.oec_users(id)
);

CREATE INDEX ops_idx_oec_cupping_sessions_tenant
  ON ops.oec_cupping_sessions(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX ops_idx_oec_cupping_samples_session
  ON ops.oec_cupping_samples(cupping_session_id);
CREATE INDEX ops_idx_oec_cupping_samples_roast
  ON ops.oec_cupping_samples(roast_session_id);
