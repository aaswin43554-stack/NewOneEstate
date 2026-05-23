CREATE TABLE ops.oec_journal_entries (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES ops.oec_tenants(id),
  allocation_id     UUID        NOT NULL REFERENCES ops.oec_allocations(id),
  document_type     VARCHAR(50) NOT NULL,
  status            VARCHAR(50) NOT NULL DEFAULT 'draft',
  draft_content     TEXT,
  published_content TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID        NOT NULL REFERENCES ops.oec_users(id),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        UUID        NOT NULL REFERENCES ops.oec_users(id),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT oec_journal_entries_doc_type_check
    CHECK (document_type IN ('field_notes','roast_log','cupping_record','allocation_record')),
  CONSTRAINT oec_journal_entries_status_check
    CHECK (status IN ('draft','under_review','published'))
);

CREATE UNIQUE INDEX ops_idx_oec_journal_entries_alloc_type
  ON ops.oec_journal_entries(tenant_id, allocation_id, document_type)
  WHERE deleted_at IS NULL;

CREATE INDEX ops_idx_oec_journal_entries_allocation
  ON ops.oec_journal_entries(allocation_id);
CREATE INDEX ops_idx_oec_journal_entries_tenant
  ON ops.oec_journal_entries(tenant_id) WHERE deleted_at IS NULL;

CREATE TABLE ops.oec_journal_versions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES ops.oec_tenants(id),
  entry_id       UUID        NOT NULL REFERENCES ops.oec_journal_entries(id),
  version_number INT         NOT NULL,
  content        TEXT        NOT NULL,
  edit_reason    TEXT        NOT NULL,
  edited_by      UUID        NOT NULL REFERENCES ops.oec_users(id),
  edited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ops_idx_oec_journal_versions_entry
  ON ops.oec_journal_versions(entry_id);
