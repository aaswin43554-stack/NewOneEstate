ALTER TABLE ops.oec_roast_profiles
  ADD COLUMN IF NOT EXISTS roast_id VARCHAR(100);
