-- Replace the full unique constraint on (tenant_id, allocation_code) with a
-- partial unique index that only enforces uniqueness among active (non-deleted)
-- allocations. This allows a code to be reused after its allocation is deleted,
-- which matches what users see in the UI (deleted allocations are not visible).

ALTER TABLE ops.oec_allocations
  DROP CONSTRAINT IF EXISTS oec_allocations_tenant_code_key;

CREATE UNIQUE INDEX oec_allocations_tenant_code_active
  ON ops.oec_allocations (tenant_id, allocation_code)
  WHERE deleted_at IS NULL;
