CREATE TYPE "public"."document_folder" AS ENUM('facturas', 'contratos', 'bancos', 'gestoria', 'otros');--> statement-breakpoint
CREATE TYPE "public"."document_target" AS ENUM('invoice', 'manual_entry', 'counterparty');--> statement-breakpoint
CREATE TYPE "public"."entry_kind" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."invoice_direction" AS ENUM('issued', 'received');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('active', 'uncollectible', 'void');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank', 'card', 'cash', 'direct_debit', 'other');--> statement-breakpoint
CREATE TABLE "document_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"target_type" "document_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"folder" "document_folder" DEFAULT 'otros' NOT NULL,
	"status" "invoice_status" DEFAULT 'active' NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_size_ck" CHECK ("documents"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"description" text NOT NULL,
	"quantity_milli" integer NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"base_cents" bigint NOT NULL,
	"vat_rate_bp" integer NOT NULL,
	"surcharge_rate_bp" integer DEFAULT 0 NOT NULL,
	"withholding_rate_bp" integer DEFAULT 0 NOT NULL,
	"category_id" uuid,
	CONSTRAINT "invoice_lines_rates_ck" CHECK ("invoice_lines"."vat_rate_bp" between 0 and 10000
      and "invoice_lines"."surcharge_rate_bp" between 0 and 10000 and "invoice_lines"."withholding_rate_bp" between 0 and 10000),
	CONSTRAINT "invoice_lines_qty_ck" CHECK ("invoice_lines"."quantity_milli" <> 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"direction" "invoice_direction" NOT NULL,
	"counterparty_id" uuid NOT NULL,
	"series" text,
	"number" text NOT NULL,
	"issue_date" date NOT NULL,
	"operation_date" date,
	"due_date" date NOT NULL,
	"description" text,
	"is_corrective" boolean DEFAULT false NOT NULL,
	"corrected_invoice_id" uuid,
	"base_cents" bigint NOT NULL,
	"vat_cents" bigint NOT NULL,
	"surcharge_cents" bigint DEFAULT 0 NOT NULL,
	"withholding_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint NOT NULL,
	"declared_total_cents" bigint,
	"status" "invoice_status" DEFAULT 'active' NOT NULL,
	"status_reason" text,
	"notes" text,
	"verifactu_hash" text,
	"verifactu_qr_url" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_due_ck" CHECK ("invoices"."due_date" >= "invoices"."issue_date"),
	CONSTRAINT "invoices_total_ck" CHECK ("invoices"."total_cents" = "invoices"."base_cents" + "invoices"."vat_cents" + "invoices"."surcharge_cents" - "invoices"."withholding_cents")
);
--> statement-breakpoint
CREATE TABLE "manual_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"kind" "entry_kind" NOT NULL,
	"entry_date" date NOT NULL,
	"description" text NOT NULL,
	"counterparty_id" uuid,
	"category_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"vat_cents" bigint DEFAULT 0 NOT NULL,
	"payment_method" "payment_method" DEFAULT 'bank' NOT NULL,
	"status" "invoice_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_entries_amount_ck" CHECK ("manual_entries"."amount_cents" > 0 and "manual_entries"."vat_cents" >= 0 and "manual_entries"."vat_cents" < "manual_entries"."amount_cents")
);
--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_auth_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_links_uq" ON "document_links" USING btree ("document_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "document_links_target_idx" ON "document_links" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "documents_entity_idx" ON "documents" USING btree ("legal_entity_id","folder");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_entity_sha_uq" ON "documents" USING btree ("legal_entity_id","sha256");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_lines_category_idx" ON "invoice_lines" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "invoices_entity_date_idx" ON "invoices" USING btree ("legal_entity_id","direction","issue_date");--> statement-breakpoint
CREATE INDEX "invoices_entity_due_idx" ON "invoices" USING btree ("legal_entity_id","due_date");--> statement-breakpoint
CREATE INDEX "invoices_counterparty_idx" ON "invoices" USING btree ("counterparty_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_issued_number_uq" ON "invoices" USING btree ("legal_entity_id",coalesce("series", ''),upper("number")) WHERE "invoices"."direction" = 'issued';--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_received_number_uq" ON "invoices" USING btree ("legal_entity_id","counterparty_id",upper("number")) WHERE "invoices"."direction" = 'received';--> statement-breakpoint
CREATE INDEX "manual_entries_entity_date_idx" ON "manual_entries" USING btree ("legal_entity_id","entry_date");