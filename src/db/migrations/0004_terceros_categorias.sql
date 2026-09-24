CREATE TYPE "public"."category_kind" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."pl_line" AS ENUM('ingresos', 'costes_directos', 'personal', 'alquiler', 'suministros', 'marketing', 'servicios_profesionales', 'otros_gastos', 'resultado_financiero', 'impuesto_beneficios');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"kind" "category_kind" NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"pgc_account" text,
	"pl_line" "pl_line" NOT NULL,
	"template_key" text,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_pgc_ck" CHECK ("categories"."pgc_account" is null or "categories"."pgc_account" ~ '^[0-9]{1,10}$'),
	CONSTRAINT "categories_not_self_parent_ck" CHECK ("categories"."parent_id" is null or "categories"."parent_id" <> "categories"."id")
);
--> statement-breakpoint
CREATE TABLE "counterparties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tax_id" text,
	"tax_id_country" char(2) DEFAULT 'ES' NOT NULL,
	"is_customer" boolean DEFAULT false NOT NULL,
	"is_supplier" boolean DEFAULT false NOT NULL,
	"email" text,
	"phone" text,
	"iban" text,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"default_income_category_id" uuid,
	"default_expense_category_id" uuid,
	"notes" text,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "counterparties_role_ck" CHECK ("counterparties"."is_customer" or "counterparties"."is_supplier"),
	CONSTRAINT "counterparties_terms_ck" CHECK ("counterparties"."payment_terms_days" between 0 and 365)
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_default_income_category_id_categories_id_fk" FOREIGN KEY ("default_income_category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_default_expense_category_id_categories_id_fk" FOREIGN KEY ("default_expense_category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_entity_idx" ON "categories" USING btree ("legal_entity_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_entity_template_uq" ON "categories" USING btree ("legal_entity_id","template_key") WHERE "categories"."template_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_entity_name_uq" ON "categories" USING btree ("legal_entity_id","kind",coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name"));--> statement-breakpoint
CREATE INDEX "counterparties_entity_idx" ON "counterparties" USING btree ("legal_entity_id");--> statement-breakpoint
CREATE INDEX "counterparties_entity_name_idx" ON "counterparties" USING btree ("legal_entity_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "counterparties_entity_tax_id_uq" ON "counterparties" USING btree ("legal_entity_id","tax_id_country","tax_id") WHERE "counterparties"."tax_id" is not null;