-- Migration 024: Fix cupping_purpose CHECK constraint to SCA values
-- DB had incorrect values (production, sampling) instead of SCA standard.
-- Remap: production → quality_check, sampling → comparative
-- Correct values: development, quality_check, comparative

ALTER TABLE ops.oec_cupping_sessions
  DROP CONSTRAINT IF EXISTS oec_cupping_sessions_cupping_purpose_check;

UPDATE ops.oec_cupping_sessions
   SET cupping_purpose = CASE cupping_purpose
     WHEN 'production' THEN 'quality_check'
     WHEN 'sampling'   THEN 'comparative'
     ELSE cupping_purpose
   END
 WHERE cupping_purpose IN ('production', 'sampling');

ALTER TABLE ops.oec_cupping_sessions
  ADD CONSTRAINT oec_cupping_sessions_cupping_purpose_check
  CHECK (cupping_purpose IN ('development', 'quality_check', 'comparative'));
