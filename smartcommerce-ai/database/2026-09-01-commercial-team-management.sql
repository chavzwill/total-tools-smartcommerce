BEGIN;

CREATE TABLE IF NOT EXISTS commercial_member_invitations (
  id text PRIMARY KEY,
  commercial_account_id text NOT NULL REFERENCES commercial_accounts(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  invited_email_normalized text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('owner','admin','approver','buyer')),
  permission_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  spend_limit_order_minor bigint,
  spend_limit_day_minor bigint,
  spend_limit_month_minor bigint,
  approval_limit_minor bigint,
  currency text NOT NULL DEFAULT 'JMD',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','cancelled','expired')),
  invited_by_customer_id text NOT NULL REFERENCES customer_accounts(id),
  accepted_by_customer_id text REFERENCES customer_accounts(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS commercial_member_invitation_pending_email_uq
ON commercial_member_invitations (commercial_account_id, invited_email_normalized)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS commercial_member_invitation_account_idx
ON commercial_member_invitations (commercial_account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS commercial_member_policies (
  commercial_account_id text NOT NULL REFERENCES commercial_accounts(id) ON DELETE CASCADE,
  member_id text NOT NULL REFERENCES commercial_account_members(id) ON DELETE CASCADE,
  permission_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  spend_limit_order_minor bigint,
  spend_limit_day_minor bigint,
  spend_limit_month_minor bigint,
  approval_limit_minor bigint,
  currency text NOT NULL DEFAULT 'JMD',
  updated_by_customer_id text NOT NULL REFERENCES customer_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (commercial_account_id, member_id)
);

ALTER TABLE commercial_member_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_member_policies ENABLE ROW LEVEL SECURITY;

COMMIT;
