-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 023: SCA Cupping Protocol — schema upgrade
--
-- Replaces the 7-attribute / 70-point custom form with the SCA standard:
--   • 7 scored attributes on a 6.00–10.00 scale (0.25 increments)
--   • 3 cup-check attributes (Uniformity, Clean Cup, Sweetness): binary per cup
--   • Defects subtracted from total
--   • Maximum possible score: 100
--
-- Existing sessions (24 May 2026, 02 Jun 2026) are flagged as legacy_scoring
-- so they are excluded from SCA averages and comparisons.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Session-level additions ────────────────────────────────────────────────

ALTER TABLE ops.oec_cupping_sessions
  ADD COLUMN IF NOT EXISTS legacy_scoring  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS number_of_cups  INTEGER NOT NULL DEFAULT 3
    CHECK (number_of_cups >= 3);

-- All existing sessions used the old 70-point system
UPDATE ops.oec_cupping_sessions SET legacy_scoring = true;

-- ── 2. Drop old 0–10 CHECK constraints on sample score columns ────────────────

ALTER TABLE ops.oec_cupping_samples
  DROP CONSTRAINT IF EXISTS oec_cupping_samples_score_aroma_check,
  DROP CONSTRAINT IF EXISTS oec_cupping_samples_score_flavour_check,
  DROP CONSTRAINT IF EXISTS oec_cupping_samples_score_acidity_check,
  DROP CONSTRAINT IF EXISTS oec_cupping_samples_score_body_check,
  DROP CONSTRAINT IF EXISTS oec_cupping_samples_score_sweetness_check,
  DROP CONSTRAINT IF EXISTS oec_cupping_samples_score_aftertaste_check,
  DROP CONSTRAINT IF EXISTS oec_cupping_samples_score_overall_check;

-- ── 3. Widen score columns to NUMERIC(4,2) for 0.25-step SCA precision ────────
--    Old INTEGER values (0–10) become x.00; legacy_scoring flag distinguishes them.

ALTER TABLE ops.oec_cupping_samples
  ALTER COLUMN score_aroma      TYPE NUMERIC(4,2) USING score_aroma::NUMERIC(4,2),
  ALTER COLUMN score_flavour    TYPE NUMERIC(4,2) USING score_flavour::NUMERIC(4,2),
  ALTER COLUMN score_acidity    TYPE NUMERIC(4,2) USING score_acidity::NUMERIC(4,2),
  ALTER COLUMN score_body       TYPE NUMERIC(4,2) USING score_body::NUMERIC(4,2),
  ALTER COLUMN score_sweetness  TYPE NUMERIC(4,2) USING score_sweetness::NUMERIC(4,2),
  ALTER COLUMN score_aftertaste TYPE NUMERIC(4,2) USING score_aftertaste::NUMERIC(4,2),
  ALTER COLUMN score_overall    TYPE NUMERIC(4,2) USING score_overall::NUMERIC(4,2);

-- ── 4. Rename columns to SCA field names ─────────────────────────────────────

ALTER TABLE ops.oec_cupping_samples
  RENAME COLUMN score_aroma   TO score_fragrance_aroma;   -- combined Fragrance/Aroma score

ALTER TABLE ops.oec_cupping_samples
  RENAME COLUMN score_flavour TO score_flavor;

ALTER TABLE ops.oec_cupping_samples
  RENAME COLUMN obs_aroma     TO obs_fragrance_dry;        -- dry grounds notes

ALTER TABLE ops.oec_cupping_samples
  RENAME COLUMN obs_flavour   TO obs_flavor;

ALTER TABLE ops.oec_cupping_samples
  RENAME COLUMN obs_sweetness TO obs_sweetness_notes;      -- now cup-check notes

-- ── 5. Add new SCA fields ─────────────────────────────────────────────────────

ALTER TABLE ops.oec_cupping_samples
  -- Wet aroma notes (after break), split from dry fragrance notes
  ADD COLUMN IF NOT EXISTS obs_aroma_wet        TEXT,

  -- 7th scored attribute: Balance (was absent in old form)
  ADD COLUMN IF NOT EXISTS score_balance        NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS obs_balance          TEXT,

  -- Intensity/level qualifiers required by SCA
  ADD COLUMN IF NOT EXISTS acidity_intensity    VARCHAR(20),  -- Low/Medium-Low/Medium/Medium-High/High
  ADD COLUMN IF NOT EXISTS body_level           VARCHAR(20),  -- Thin/Light/Medium/Heavy/Full

  -- Cup-check per-cup results (JSON boolean arrays, length = number_of_cups)
  ADD COLUMN IF NOT EXISTS uniformity_cups      JSONB,        -- e.g. [true,true,true]
  ADD COLUMN IF NOT EXISTS clean_cup_cups       JSONB,
  ADD COLUMN IF NOT EXISTS sweetness_cups       JSONB,

  -- Computed cup-check scores (passing_cups × 2)
  -- score_uniformity and score_clean_cup are new; score_sweetness is repurposed
  ADD COLUMN IF NOT EXISTS score_uniformity     NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS score_clean_cup      NUMERIC(4,2),
  -- score_sweetness (already exists) now stores the cup-check sweetness score for SCA records

  -- Defects as JSON array: [{type,cups_affected,intensity,multiplier,score,notes}, ...]
  ADD COLUMN IF NOT EXISTS defects_json         JSONB NOT NULL DEFAULT '[]',

  -- Decision notes (required when decision = Adjust or Reject)
  ADD COLUMN IF NOT EXISTS decision_notes       TEXT;
