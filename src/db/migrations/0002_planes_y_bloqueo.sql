CREATE TYPE "public"."plan_code" AS ENUM('esencial', 'profesional', 'empresa', 'finance_department');--> statement-breakpoint
CREATE TABLE "auth_login_lockout" (
	"email" text PRIMARY KEY NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"first_failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "plan" "plan_code" DEFAULT 'esencial' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "custom_monthly_price_cents" bigint;--> statement-breakpoint
-- Explícito aunque lo cubran los privilegios por defecto de 0001.
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_login_lockout TO finanzas_app;
