-- Optional per-tenant webhook secret for POST /api/allocations/sync-from-admin.
-- Nullable and unused by default: existing tenants keep authenticating with
-- the single global ONE_ESTATE_WEBHOOK_SECRET (backward compatible). Once a
-- tenant's own secret is set here, the sync route requires calls for that
-- tenant to use it instead of the shared secret, so one leaked global secret
-- no longer lets a caller write allocations into every tenant on the
-- deployment just by naming a different tenant_id in the payload.
ALTER TABLE ops.oec_tenants ADD COLUMN webhook_secret VARCHAR(255);
