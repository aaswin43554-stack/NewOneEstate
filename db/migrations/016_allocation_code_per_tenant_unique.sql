-- Fix allocation_code uniqueness to be per-tenant instead of globally unique.
-- A multi-tenant platform needs W-01 to be reusable across different tenants.
ALTER TABLE ops.oec_allocations
  DROP CONSTRAINT IF EXISTS oec_allocations_allocation_code_key;

ALTER TABLE ops.oec_allocations
  ADD CONSTRAINT oec_allocations_tenant_code_key UNIQUE (tenant_id, allocation_code);
