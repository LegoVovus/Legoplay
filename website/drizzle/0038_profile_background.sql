-- Per-user profile banner colour (hex, e.g. #3b82f6). NULL = default look.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "profile_background" text;
