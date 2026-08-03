-- Trigram indexes for the ILIKE '%term%' searches used by /api/search and the
-- contacts list filter. A leading-wildcard ILIKE can't use a plain btree
-- index — every call does a full table scan. pg_trgm + a GIN index lets
-- Postgres use an index scan for these instead, which matters once these
-- tables grow past a few hundred rows.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_lots_lot_code_trgm
  ON ops.oec_lots USING GIN (lot_code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_lots_estate_trgm
  ON ops.oec_lots USING GIN (estate gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_roast_sessions_batch_code_trgm
  ON ops.oec_roast_sessions USING GIN (batch_code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_allocations_allocation_code_trgm
  ON ops.oec_allocations USING GIN (allocation_code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm
  ON ops.oec_contacts USING GIN (name gin_trgm_ops);
