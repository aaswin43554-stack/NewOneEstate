ALTER TABLE ops.oec_labels
  ADD COLUMN IF NOT EXISTS estate_location TEXT,
  ADD COLUMN IF NOT EXISTS variety         TEXT,
  ADD COLUMN IF NOT EXISTS roast_level     TEXT,
  ADD COLUMN IF NOT EXISTS flavour_notes   TEXT,
  ADD COLUMN IF NOT EXISTS net_weight_g    INTEGER DEFAULT 200,
  ADD COLUMN IF NOT EXISTS label_image     TEXT;

ALTER TABLE ops.oec_labels
  ALTER COLUMN qr_url          DROP NOT NULL,
  ALTER COLUMN qr_code_base64  DROP NOT NULL;
