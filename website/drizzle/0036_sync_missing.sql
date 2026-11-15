-- 0036_sync_missing.sql
-- LegoPlay: bring the database fully in line with src/lib/server/db/schema.ts.
-- Safety: only additive / non-destructive changes. Safe to run repeatedly.

-- Missing enum values (BATTLEPASS & FRIEND are used by the notification code,
-- TOGGLE_DEVELOPER & TOGGLE_BADGE by the admin panel).
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'BATTLEPASS';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'FRIEND';
ALTER TYPE "admin_action" ADD VALUE IF NOT EXISTS 'TOGGLE_DEVELOPER';
ALTER TYPE "admin_action" ADD VALUE IF NOT EXISTS 'TOGGLE_BADGE';

-- Missing columns
ALTER TABLE "apikey" ADD COLUMN IF NOT EXISTS "config_id" text;
ALTER TABLE "chat_channel" ADD COLUMN IF NOT EXISTS "name" character varying(60);
ALTER TABLE "chat_channel" ADD COLUMN IF NOT EXISTS "image" text;

-- Missing table (not created by earlier migrations, but required by the code)
CREATE TABLE IF NOT EXISTS "push_subscription" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscription_endpoint_unique" UNIQUE("endpoint")
);
DO $$ BEGIN
	ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Missing index
CREATE INDEX IF NOT EXISTS "push_subscription_user_id_idx" ON "push_subscription" USING btree ("user_id");

-- Integrity check for user blocks
DO $$ BEGIN
	ALTER TABLE "user_block" ADD CONSTRAINT "no_self_block" CHECK ("blocker_id" <> "blocked_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Column types aligned with the code schema
ALTER TABLE "coin" ALTER COLUMN "name" TYPE character varying(45);
ALTER TABLE "coin" ALTER COLUMN "symbol" TYPE character varying(16);
ALTER TABLE "coin" ALTER COLUMN "market_cap" TYPE numeric(42, 2);
ALTER TABLE "coin" ALTER COLUMN "volume_24h" TYPE numeric(42, 2);
ALTER TABLE "coin" ALTER COLUMN "change_24h" TYPE numeric(14, 4);
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "currency_type" character varying(20) DEFAULT 'cash';
ALTER TABLE "transaction" ALTER COLUMN "currency_type" TYPE character varying(20);

-- Defaults aligned with the code schema
ALTER TABLE "transaction" ALTER COLUMN "currency_type" SET DEFAULT 'cash';
ALTER TABLE "user" ALTER COLUMN "bio" SET DEFAULT 'An profile on LegoPlay!';
UPDATE "transaction" SET "currency_type" = 'cash' WHERE "currency_type" = 'default';
