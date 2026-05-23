CREATE TABLE ops.oec_contacts (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID         NOT NULL REFERENCES ops.oec_tenants(id),
  name                   VARCHAR(255) NOT NULL,
  primary_contact_method VARCHAR(255),
  location               VARCHAR(255),
  market_segment         VARCHAR(50),
  preferred_channel      VARCHAR(100),
  personal_notes         TEXT,
  status                 VARCHAR(50)  NOT NULL DEFAULT 'prospect',
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by             UUID         NOT NULL REFERENCES ops.oec_users(id),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by             UUID         NOT NULL REFERENCES ops.oec_users(id),
  deleted_at             TIMESTAMPTZ,
  CONSTRAINT oec_contacts_status_check
    CHECK (status IN ('prospect','active_buyer','private_list','trade_account'))
);

CREATE INDEX ops_idx_oec_contacts_tenant
  ON ops.oec_contacts(tenant_id) WHERE deleted_at IS NULL;

CREATE TABLE ops.oec_contact_request_links (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES ops.oec_tenants(id),
  contact_id            UUID        NOT NULL REFERENCES ops.oec_contacts(id),
  allocation_request_id UUID        NOT NULL REFERENCES ops.oec_allocation_requests(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID        NOT NULL REFERENCES ops.oec_users(id),
  UNIQUE (contact_id, allocation_request_id)
);

CREATE INDEX ops_idx_oec_contact_req_links_contact
  ON ops.oec_contact_request_links(contact_id);
CREATE INDEX ops_idx_oec_contact_req_links_request
  ON ops.oec_contact_request_links(allocation_request_id);
