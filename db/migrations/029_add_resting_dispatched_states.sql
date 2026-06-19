-- Migration 029: Restore resting and dispatched as discrete allocation states
--
-- New 6-state lifecycle:
--   upcoming → open_for_requests → roasting_in_progress → resting → dispatched → allocation_closed
--
-- resting:    coffee is bagged, in rest period, not yet dispatched
-- dispatched: coffee has left the roastery, awaiting final close

ALTER TYPE ops.allocation_state ADD VALUE IF NOT EXISTS 'resting'    AFTER 'roasting_in_progress';
ALTER TYPE ops.allocation_state ADD VALUE IF NOT EXISTS 'dispatched'  AFTER 'resting';
