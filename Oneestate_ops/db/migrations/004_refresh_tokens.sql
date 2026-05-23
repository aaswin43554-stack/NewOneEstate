CREATE TABLE ops.oec_refresh_tokens (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID         NOT NULL REFERENCES ops.oec_users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ  NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX ops_idx_oec_refresh_tokens_user_id    ON ops.oec_refresh_tokens(user_id);
CREATE INDEX ops_idx_oec_refresh_tokens_token_hash ON ops.oec_refresh_tokens(token_hash);
