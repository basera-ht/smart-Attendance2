CREATE SCHEMA "smart_attendance";
--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late', 'half-day', 'leave');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."leave_type" AS ENUM('sick', 'vacation', 'personal', 'emergency', 'maternity', 'paternity', 'bereavement', 'other');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'in-progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'hr', 'employee');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "smart_attendance"."attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"check_in_time" timestamp,
	"check_in_location" varchar(255),
	"check_in_ip_address" varchar(45),
	"check_in_device_info" text,
	"check_out_time" timestamp,
	"check_out_location" varchar(255),
	"check_out_ip_address" varchar(45),
	"check_out_device_info" text,
	"status" "attendance_status" DEFAULT 'present' NOT NULL,
	"working_hours" integer DEFAULT 0 NOT NULL,
	"overtime" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"is_approved" boolean DEFAULT false NOT NULL,
	"approved_by_id" integer,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "smart_attendance"."leaves" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"leave_type" "leave_type" NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"total_days" integer DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"status" "leave_status" DEFAULT 'pending' NOT NULL,
	"applied_date" timestamp DEFAULT now() NOT NULL,
	"reviewed_by_id" integer,
	"reviewed_at" timestamp,
	"review_comments" text,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"is_paid" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "smart_attendance"."refresh_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "smart_attendance"."selected_optional_holidays" (
	"id" serial PRIMARY KEY NOT NULL,
	"holiday_id" integer NOT NULL,
	"year" integer NOT NULL,
	"selected_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "smart_attendance"."tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"due_date" timestamp,
	"completed_at" timestamp,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "smart_attendance"."users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" text NOT NULL,
	"role" "user_role" DEFAULT 'employee' NOT NULL,
	"employee_id" varchar(50),
	"department" varchar(100),
	"position" varchar(100),
	"phone" varchar(20),
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login" timestamp,
	"profile_picture" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "smart_attendance"."attendance" ADD CONSTRAINT "attendance_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "smart_attendance"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "smart_attendance"."attendance" ADD CONSTRAINT "attendance_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "smart_attendance"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "smart_attendance"."leaves" ADD CONSTRAINT "leaves_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "smart_attendance"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "smart_attendance"."leaves" ADD CONSTRAINT "leaves_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "smart_attendance"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "smart_attendance"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "smart_attendance"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "smart_attendance"."selected_optional_holidays" ADD CONSTRAINT "selected_optional_holidays_selected_by_users_id_fk" FOREIGN KEY ("selected_by") REFERENCES "smart_attendance"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "smart_attendance"."tasks" ADD CONSTRAINT "tasks_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "smart_attendance"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_employee_date_idx" ON "smart_attendance"."attendance" USING btree ("employee_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_date_idx" ON "smart_attendance"."attendance" USING btree ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_status_idx" ON "smart_attendance"."attendance" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leaves_employee_start_date_idx" ON "smart_attendance"."leaves" USING btree ("employee_id","start_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leaves_status_start_date_idx" ON "smart_attendance"."leaves" USING btree ("status","start_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leaves_applied_date_idx" ON "smart_attendance"."leaves" USING btree ("applied_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_token_idx" ON "smart_attendance"."refresh_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_id_idx" ON "smart_attendance"."refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_expires_at_idx" ON "smart_attendance"."refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "selected_holidays_holiday_year_idx" ON "smart_attendance"."selected_optional_holidays" USING btree ("holiday_id","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "selected_holidays_year_idx" ON "smart_attendance"."selected_optional_holidays" USING btree ("year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_employee_status_idx" ON "smart_attendance"."tasks" USING btree ("employee_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_due_date_idx" ON "smart_attendance"."tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "smart_attendance"."users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_employee_id_idx" ON "smart_attendance"."users" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_department_idx" ON "smart_attendance"."users" USING btree ("department");