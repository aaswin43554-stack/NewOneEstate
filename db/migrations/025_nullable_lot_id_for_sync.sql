-- Migration 025: Allow lot_id to be NULL for allocations synced from One Estate admin
-- Synced allocations may not yet have a matching lot in OEC Ops.
ALTER TABLE ops.oec_allocations ALTER COLUMN lot_id DROP NOT NULL;
