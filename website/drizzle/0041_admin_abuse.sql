-- Admin Abuse: extra audit actions for head-admin broadcasts and grants.
ALTER TYPE admin_action ADD VALUE IF NOT EXISTS 'ABUSE_BROADCAST';
ALTER TYPE admin_action ADD VALUE IF NOT EXISTS 'ABUSE_GRANT';
