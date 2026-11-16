ALTER TABLE "auth"."sessions" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'external' NOT NULL;--> statement-breakpoint
-- users holds the people who can sign in, a few thousand rows at most, and
-- every one fits, since role was just added with its default
-- squawk-ignore constraint-missing-not-valid
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" in ('internal', 'external'));