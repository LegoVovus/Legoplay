-- Daily quests: 3 daily slots (easy/medium/hard) with cash/gem rewards.
CREATE TABLE IF NOT EXISTS "daily_quest_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"day" varchar(10) NOT NULL,
	"slot" integer NOT NULL,
	"quest_type" varchar(50) NOT NULL,
	"target" integer NOT NULL,
	"reward_cash" numeric(30, 8) DEFAULT '0' NOT NULL,
	"reward_gems" integer DEFAULT 0 NOT NULL,
	"baseline" integer DEFAULT 0 NOT NULL,
	"claimed" boolean DEFAULT false NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_quest_progress_user_day_slot_unique" UNIQUE("user_id","day","slot")
);

DO $$ BEGIN
 ALTER TABLE "daily_quest_progress" ADD CONSTRAINT "daily_quest_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "daily_quest_progress_user_day_idx" ON "daily_quest_progress" USING btree ("user_id","day");
