-- Optional personal accent colour for the site theme (hex, e.g. #3b82f6).
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "theme_color" text;
