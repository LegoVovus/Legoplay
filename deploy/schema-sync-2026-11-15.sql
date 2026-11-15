-- LegoPlay: синхронизация БД со schema.ts (только добавления, без удалений)
-- 1. Недостающие значения enum (из-за них падали уведомления BATTLEPASS/FRIEND и админ-логи)
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'BATTLEPASS';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'FRIEND';
ALTER TYPE public.admin_action ADD VALUE IF NOT EXISTS 'TOGGLE_DEVELOPER';
ALTER TYPE public.admin_action ADD VALUE IF NOT EXISTS 'TOGGLE_BADGE';

-- 2. Недостающие колонки
ALTER TABLE public.apikey ADD COLUMN IF NOT EXISTS config_id text;
ALTER TABLE public.chat_channel ADD COLUMN IF NOT EXISTS name character varying(60);
ALTER TABLE public.chat_channel ADD COLUMN IF NOT EXISTS image text;

-- 3. Недостающий индекс
CREATE INDEX IF NOT EXISTS push_subscription_user_id_idx ON public.push_subscription (user_id);

-- 4. Ограничение целостности (self-block)
DO $$ BEGIN
  ALTER TABLE public.user_block ADD CONSTRAINT no_self_block CHECK (blocker_id <> blocked_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Приведение типов колонок к схеме кода (данные проверены, влезают)
ALTER TABLE public.coin ALTER COLUMN name TYPE character varying(45);
ALTER TABLE public.coin ALTER COLUMN symbol TYPE character varying(16);
ALTER TABLE public.coin ALTER COLUMN market_cap TYPE numeric(42,2);
ALTER TABLE public.coin ALTER COLUMN volume_24h TYPE numeric(42,2);
ALTER TABLE public.coin ALTER COLUMN change_24h TYPE numeric(14,4);

-- 6. Значения по умолчанию, как в схеме
ALTER TABLE public.transaction ALTER COLUMN currency_type SET DEFAULT 'cash';
ALTER TABLE public."user" ALTER COLUMN bio SET DEFAULT 'An profile on LegoPlay!';
