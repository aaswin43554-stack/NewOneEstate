-- Migration 031: Support multiple green lots per allocation.
-- An allocation can draw green from several lots (e.g. "half from each").
-- The oec_allocations.lot_id column is kept as the "primary" lot for backward
-- compatibility; this junction table holds the full per-lot breakdown.
CREATE TABLE IF NOT EXISTS ops.oec_allocation_lots (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES ops.oec_tenants(id),
  allocation_id    UUID        NOT NULL REFERENCES ops.oec_allocations(id) ON DELETE CASCADE,
  lot_id           UUID        NOT NULL REFERENCES ops.oec_lots(id),
  green_quantity_g INTEGER     NOT NULL CHECK (green_quantity_g > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (allocation_id, lot_id)
);

CREATE INDEX IF NOT EXISTS ops_idx_oec_allocation_lots_alloc ON ops.oec_allocation_lots(allocation_id);
CREATE INDEX IF NOT EXISTS ops_idx_oec_allocation_lots_lot   ON ops.oec_allocation_lots(lot_id);

-- Backfill: one junction row per existing allocation that already has a single lot.
INSERT INTO ops.oec_allocation_lots (tenant_id, allocation_id, lot_id, green_quantity_g)
SELECT a.tenant_id, a.id, a.lot_id, a.planned_green_quantity_g
FROM ops.oec_allocations a
WHERE a.lot_id IS NOT NULL
  AND a.deleted_at IS NULL
  AND a.planned_green_quantity_g > 0
  AND NOT EXISTS (
    SELECT 1 FROM ops.oec_allocation_lots al WHERE al.allocation_id = a.id
  );
