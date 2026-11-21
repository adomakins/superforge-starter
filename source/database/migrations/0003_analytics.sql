CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"visit_id" uuid,
	"visitor_id" text,
	"user_id" uuid,
	"path" text,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" text NOT NULL,
	"anonymous" boolean NOT NULL,
	"user_id" uuid,
	"started_at" timestamp (3) with time zone NOT NULL,
	"ended_at" timestamp (3) with time zone NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"bounced" boolean DEFAULT true NOT NULL,
	"landing_path" text,
	"exit_path" text,
	"referrer" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"ad_network" text,
	"country" text,
	"region" text,
	"city" text,
	"device" text,
	"browser" text,
	"os" text
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_visit_id_analytics_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."analytics_visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_visits" ADD CONSTRAINT "analytics_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_occurred_at_index" ON "analytics_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_visit_id_index" ON "analytics_events" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "analytics_events_user_id_index" ON "analytics_events" USING btree ("user_id") WHERE "analytics_events"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "analytics_visits_started_at_index" ON "analytics_visits" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "analytics_visits_visitor_id_ended_at_index" ON "analytics_visits" USING btree ("visitor_id","ended_at");--> statement-breakpoint
CREATE INDEX "analytics_visits_user_id_index" ON "analytics_visits" USING btree ("user_id") WHERE "analytics_visits"."user_id" is not null;