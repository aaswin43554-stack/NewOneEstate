-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 030: Collapse allocation lifecycle back to 4 states
--
-- Migration 029 re-introduced 'resting' and 'dispatched'. Per the latest spec
-- we only need 4 states; the two intermediate ones are removed.
--
-- 6-state flow (current):
--   upcoming → open_for_requests → roasting_in_progress → resting → dispatched → allocation_closed
--
-- New 4-state flow:
--   upcoming → open_for_requests → roasting_in_progress → allocation_closed
--
-- Remap of any existing rows:
--   resting     → roasting_in_progress  (still bagging/resting = in production)
--   dispatched  → allocation_closed     (left the roastery = done)
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Drop the default that references the enum (must happen before DROP TYPE)
ALTER TABLE ops.oec_allocations ALTER COLUMN state DROP DEFAULT;

-- Step 2: Loosen the enum-typed columns to text so values can be remapped freely
ALTER TABLE ops.oec_allocations          ALTER COLUMN state      TYPE text;
ALTER TABLE ops.oec_allocation_state_log ALTER COLUMN from_state TYPE text;
ALTER TABLE ops.oec_allocation_state_log ALTER COLUMN to_state   TYPE text;

-- Step 3: Remap the removed state values
UPDATE ops.oec_allocations
   SET state = CASE state
     WHEN 'resting'    THEN 'roasting_in_progress'
     WHEN 'dispatched' THEN 'allocation_closed'
     ELSE state
   END;

UPDATE ops.oec_allocation_state_log
   SET from_state = CASE from_state
                      WHEN 'resting'    THEN 'roasting_in_progress'
                      WHEN 'dispatched' THEN 'allocation_closed'
                      ELSE from_state
                    END,
       to_state   = CASE to_state
                      WHEN 'resting'    THEN 'roasting_in_progress'
                      WHEN 'dispatched' THEN 'allocation_closed'
                      ELSE to_state
                    END;

-- Step 4: Drop the 6-value enum and recreate it with 4 values
DROP TYPE IF EXISTS ops.allocation_state;

CREATE TYPE ops.allocation_state AS ENUM (
  'upcoming',
  'open_for_requests',
  'roasting_in_progress',
  'allocation_closed'
);

-- Step 5: Restore columns to the new enum type and re-add the default
ALTER TABLE ops.oec_allocations
  ALTER COLUMN state TYPE ops.allocation_state USING state::ops.allocation_state;

ALTER TABLE ops.oec_allocations
  ALTER COLUMN state SET DEFAULT 'upcoming';

ALTER TABLE ops.oec_allocation_state_log
  ALTER COLUMN from_state TYPE ops.allocation_state USING from_state::ops.allocation_state;

ALTER TABLE ops.oec_allocation_state_log
  ALTER COLUMN to_state TYPE ops.allocation_state USING to_state::ops.allocation_state;
