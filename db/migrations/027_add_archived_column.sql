-- Migration 027: Add archived_at column to oec_allocations
-- Allows closed allocations to be archived without changing the 4-state enum.
-- archived_at IS NULL  → active (visible in dashboard)
-- archived_at IS NOT NULL → archived (hidden from dashboard by default)

ALTER TABLE ops.oec_allocations
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;
