-- better-auth's api-key plugin owns keys through "reference_id" and never
-- writes the legacy "user_id" column, so it must be nullable.
ALTER TABLE "apikey" ALTER COLUMN "user_id" DROP NOT NULL;
