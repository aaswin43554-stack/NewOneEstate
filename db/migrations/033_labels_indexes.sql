-- Speed up GET /api/labels list query which LEFT JOINs oec_labels on
-- (allocation_id, tenant_id). Without these indexes Postgres does full
-- table scans on every Labels page load.

CREATE INDEX IF NOT EXISTS idx_labels_allocation_id
  ON ops.oec_labels(allocation_id);

CREATE INDEX IF NOT EXISTS idx_labels_tenant_id
  ON ops.oec_labels(tenant_id);
