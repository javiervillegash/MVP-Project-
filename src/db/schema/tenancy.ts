/**
 * Jerarquía multiempresa:
 *   Organization (la firma administradora)
 *     └─ Company (cliente comercial, contrata un paquete)
 *          └─ LegalEntity (cada NIF gestionado: SL, SA, autónomo…)
 *
 * Todas las tablas de negocio llevan organization_id y, cuando aplica,
 * legal_entity_id. La base de datos las protege con Row-Level Security
 * (ver migración 0001_rls_audit.sql).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  char,
  index,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authUser } from "./auth";

export const recordStatus = pgEnum("record_status", ["active", "archived"]);

export const legalForm = pgEnum("legal_form", [
  "sl",
  "slu",
  "sa",
  "autonomo",
  "comunidad_bienes",
  "sociedad_civil",
  "cooperativa",
  "asociacion",
  "otra",
]);

export const vatRegime = pgEnum("vat_regime", [
  "general",
  "recargo_equivalencia",
  "simplificado",
  "criterio_caja",
  "exento",
]);

export const filingFrequency = pgEnum("filing_frequency", ["trimestral", "mensual"]);

export const planCode = pgEnum("plan_code", ["esencial", "profesional", "empresa", "finance_department"]);

export const memberRole = pgEnum("member_role", [
  "org_admin",
  "gestor",
  "client_director",
  "client_member",
  "gestoria",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  taxId: text("tax_id"),
  status: recordStatus("status").notNull().default("active"),
  ...timestamps,
});

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    status: recordStatus("status").notNull().default("active"),
    /** Gestor responsable del cliente (informativo; el acceso lo da Membership). */
    managerUserId: text("manager_user_id").references(() => authUser.id),
    /** Paquete contratado (ver modules/access/entitlements.ts). */
    plan: planCode("plan").notNull().default("esencial"),
    /** Precio pactado en céntimos; nulo = precio base del paquete. Obligatorio en Finance Department. */
    customMonthlyPriceCents: bigint("custom_monthly_price_cents", { mode: "number" }),
    ...timestamps,
  },
  (t) => [index("companies_org_idx").on(t.organizationId)],
);

export const legalEntities = pgTable(
  "legal_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    legalName: text("legal_name").notNull(),
    /** NIF normalizado (mayúsculas, sin espacios ni guiones). */
    taxId: text("tax_id").notNull(),
    legalForm: legalForm("legal_form").notNull(),
    vatRegime: vatRegime("vat_regime").notNull().default("general"),
    vatFilingFrequency: filingFrequency("vat_filing_frequency").notNull().default("trimestral"),
    fiscalYearStartMonth: smallint("fiscal_year_start_month").notNull().default(1),
    currency: char("currency", { length: 3 }).notNull().default("EUR"),
    status: recordStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    index("legal_entities_org_idx").on(t.organizationId),
    index("legal_entities_company_idx").on(t.companyId),
    unique("legal_entities_org_tax_id_uq").on(t.organizationId, t.taxId),
    check("legal_entities_fy_month_ck", sql`${t.fiscalYearStartMonth} between 1 and 12`),
  ],
);

/**
 * Da a un usuario un rol con un ámbito:
 *   - org_admin: toda la organización (company_id y legal_entity_id nulos)
 *   - resto de roles: una Company completa o una LegalEntity concreta
 */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id),
    role: memberRole("role").notNull(),
    companyId: uuid("company_id").references(() => companies.id),
    legalEntityId: uuid("legal_entity_id").references(() => legalEntities.id),
    ...timestamps,
  },
  (t) => [
    index("memberships_user_idx").on(t.userId),
    index("memberships_org_idx").on(t.organizationId),
    unique("memberships_scope_uq")
      .on(t.organizationId, t.userId, t.role, t.companyId, t.legalEntityId)
      .nullsNotDistinct(),
    check(
      "memberships_scope_ck",
      sql`(${t.role} = 'org_admin' and ${t.companyId} is null and ${t.legalEntityId} is null)
       or (${t.role} <> 'org_admin' and ((${t.companyId} is null) <> (${t.legalEntityId} is null)))`,
    ),
  ],
);

/**
 * Registro de auditoría. Lo escriben triggers de base de datos, no el código
 * de la aplicación, así que ningún cambio puede escaparse. La aplicación solo
 * tiene permiso de lectura (y solo el Administrador lo ve, por RLS).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    legalEntityId: uuid("legal_entity_id"),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    tableName: text("table_name").notNull(),
    recordId: text("record_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    changedFields: text("changed_fields").array(),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_org_created_idx").on(t.organizationId, t.createdAt),
    index("audit_log_record_idx").on(t.tableName, t.recordId),
  ],
);
