-- Link profiles back to the source roast session they were activated from
ALTER TABLE ops.oec_roast_profiles
  ADD COLUMN IF NOT EXISTS source_session_id UUID REFERENCES ops.oec_roast_sessions(id);

-- Allow profiles without a flavour target (e.g. when first activated from session)
ALTER TABLE ops.oec_roast_profiles
  ALTER COLUMN flavour_target DROP NOT NULL;
