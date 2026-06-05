-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 022: Collapse to 4-state allocation lifecycle + One Estate sync
--
-- Old 7-state flow: upcoming → open_for_requests → closed →
--                   roasting_in_progress → resting → dispatched → archived
--
-- New 4-state flow (matches One Estate admin panel):
--   upcoming → open_for_requests → roasting_in_progress → allocation_closed
--
-- Remap:
--   closed               → open_for_requests
--   resting              → roasting_in_progress
--   dispatched, archived → allocation_closed
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Loosen column types to text so we can remap values freely
ALTER TABLE ops.oec_allocations
  ALTER COLUMN state TYPE text;

ALTER TABLE ops.oec_allocation_state_log
  ALTER COLUMN from_state TYPE text;

ALTER TABLE ops.oec_allocation_state_log
  ALTER COLUMN to_state TYPE text;

-- Step 2: Remap obsolete state values
UPDATE ops.oec_allocations
   SET state = CASE state
     WHEN 'closed'               THEN 'open_for_requests'
     WHEN 'resting'              THEN 'roasting_in_progress'
     WHEN 'dispatched'           THEN 'allocation_closed'
     WHEN 'archived'             THEN 'allocation_closed'
     ELSE state
   END;

UPDATE ops.oec_allocation_state_log
   SET from_state = CASE from_state
                      WHEN 'closed'      THEN 'open_for_requests'
                      WHEN 'resting'     THEN 'roasting_in_progress'
                      WHEN 'dispatched'  THEN 'allocation_closed'
                      WHEN 'archived'    THEN 'allocation_closed'
                      ELSE from_state
                    END,
       to_state   = CASE to_state
                      WHEN 'closed'      THEN 'open_for_requests'
                      WHEN 'resting'     THEN 'roasting_in_progress'
                      WHEN 'dispatched'  THEN 'allocation_closed'
                      WHEN 'archived'    THEN 'allocation_closed'
                      ELSE to_state
                    END;

-- Step 3: Drop the old 7-value enum and recreate with 4 values
DROP TYPE IF EXISTS ops.allocation_state;

CREATE TYPE ops.allocation_state AS ENUM (
  'upcoming',
  'open_for_requests',
  'roasting_in_progress',
  'allocation_closed'
);

-- Step 4: Restore columns to the new enum type
ALTER TABLE ops.oec_allocations
  ALTER COLUMN state
    TYPE ops.allocation_state
    USING state::ops.allocation_state,
  ALTER COLUMN state SET DEFAULT 'upcoming';

ALTER TABLE ops.oec_allocation_state_log
  ALTER COLUMN from_state
    TYPE ops.allocation_state
    USING from_state::ops.allocation_state;

ALTER TABLE ops.oec_allocation_state_log
  ALTER COLUMN to_state
    TYPE ops.allocation_state
    USING to_state::ops.allocation_state;

-- Step 5: Add One Estate admin integration fields
-- source:      'manual' (created in OEC Ops) | 'one_estate' (synced from admin)
-- external_id: ID from the One Estate admin system for upsert matching
ALTER TABLE ops.oec_allocations
  ADD COLUMN IF NOT EXISTS source      VARCHAR(20) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS ops_idx_oec_alloc_external_id
  ON ops.oec_allocations(tenant_id, external_id)
  WHERE external_id IS NOT NULL AND deleted_at IS NULL;
