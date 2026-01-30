CREATE TABLE IF NOT EXISTS "smart_attendance"."geofences" (
	"id" serial PRIMARY KEY NOT NULL,
	"office_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"polygon" jsonb NOT NULL,
	"radius" integer,
	"tolerance" integer DEFAULT 15 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "smart_attendance"."offices" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "smart_attendance"."qr_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"qr_id" varchar(255) NOT NULL,
	"office_id" integer NOT NULL,
	"geofence_id" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp NOT NULL,
	"is_used" boolean DEFAULT false NOT NULL,
	"used_at" timestamp,
	"used_by" integer,
	"nonce" varchar(255) NOT NULL,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "qr_codes_qr_id_unique" UNIQUE("qr_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "smart_attendance"."qr_validation_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"qr_id" varchar(255),
	"user_id" integer,
	"office_id" integer,
	"is_valid" boolean NOT NULL,
	"validation_result" jsonb NOT NULL,
	"gps_lat" varchar(50),
	"gps_lng" varchar(50),
	"gps_accuracy" integer,
	"ip_address" varchar(45),
	"user_agent" text,
	"failure_reason" text,
	"is_suspicious" boolean DEFAULT false NOT NULL,
	"suspicious_flags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "smart_attendance"."geofences" ADD CONSTRAINT "geofences_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "smart_attendance"."offices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "smart_attendance"."geofences" ADD CONSTRAINT "geofences_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "smart_attendance"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "smart_attendance"."offices" ADD CONSTRAINT "offices_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "smart_attendance"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "smart_attendance"."qr_codes" ADD CONSTRAINT "qr_codes_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "smart_attendance"."offices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "smart_attendance"."qr_codes" ADD CONSTRAINT "qr_codes_geofence_id_geofences_id_fk" FOREIGN KEY ("geofence_id") REFERENCES "smart_attendance"."geofences"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "smart_attendance"."qr_codes" ADD CONSTRAINT "qr_codes_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "smart_attendance"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "smart_attendance"."qr_codes" ADD CONSTRAINT "qr_codes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "smart_attendance"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "smart_attendance"."qr_validation_logs" ADD CONSTRAINT "qr_validation_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "smart_attendance"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "smart_attendance"."qr_validation_logs" ADD CONSTRAINT "qr_validation_logs_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "smart_attendance"."offices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "geofences_office_id_idx" ON "smart_attendance"."geofences" USING btree ("office_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "geofences_is_active_idx" ON "smart_attendance"."geofences" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offices_name_idx" ON "smart_attendance"."offices" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offices_is_active_idx" ON "smart_attendance"."offices" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qr_codes_qr_id_idx" ON "smart_attendance"."qr_codes" USING btree ("qr_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qr_codes_office_id_idx" ON "smart_attendance"."qr_codes" USING btree ("office_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qr_codes_expires_at_idx" ON "smart_attendance"."qr_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qr_codes_is_used_idx" ON "smart_attendance"."qr_codes" USING btree ("is_used");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qr_codes_nonce_idx" ON "smart_attendance"."qr_codes" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qr_validation_logs_qr_id_idx" ON "smart_attendance"."qr_validation_logs" USING btree ("qr_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qr_validation_logs_user_id_idx" ON "smart_attendance"."qr_validation_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qr_validation_logs_is_valid_idx" ON "smart_attendance"."qr_validation_logs" USING btree ("is_valid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qr_validation_logs_is_suspicious_idx" ON "smart_attendance"."qr_validation_logs" USING btree ("is_suspicious");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qr_validation_logs_created_at_idx" ON "smart_attendance"."qr_validation_logs" USING btree ("created_at");