/**
 * Datos maestros contables de cada sociedad: terceros (clientes y
 * proveedores) y categorías de ingresos y gastos.
 *
 * Todas las tablas llevan organization_id + legal_entity_id y están
 * protegidas por RLS con app.can_see_entity() (migración 0004).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { legalEntities, organizations, recordStatus } from "./tenancy";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const categoryKind = pgEnum("category_kind", ["income", "expense"]);

/**
 * Línea de la cuenta de resultados interna a la que suma cada categoría
 * (sección 13 del documento de diseño).
 */
export const plLine = pgEnum("pl_line", [
  "ingresos",
  "costes_directos",
  "personal",
  "alquiler",
  "suministros",
  "marketing",
  "servicios_profesionales",
  "otros_gastos",
  "resultado_financiero",
  "impuesto_beneficios",
]);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    legalEntityId: uuid("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    kind: categoryKind("kind").notNull(),
    /** Solo dos niveles: una categoría principal y sus subcategorías. */
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id),
    name: text("name").notNull(),
    /** Cuenta del Plan General Contable orientativa (p. ej. "628"). */
    pgcAccount: text("pgc_account"),
    plLine: plLine("pl_line").notNull(),
    /**
     * Clave estable de la plantilla (p. ej. "suministros.electricidad"). Permite
     * que una regla de la organización (ENDESA → Electricidad) funcione en todas
     * las sociedades aunque cada una tenga su propia copia de la categoría.
     */
    templateKey: text("template_key"),
    sortOrder: smallint("sort_order").notNull().default(0),
    status: recordStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    index("categories_entity_idx").on(t.legalEntityId, t.kind),
    uniqueIndex("categories_entity_template_uq")
      .on(t.legalEntityId, t.templateKey)
      .where(sql`${t.templateKey} is not null`),
    uniqueIndex("categories_entity_name_uq").on(
      t.legalEntityId,
      t.kind,
      sql`coalesce(${t.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`lower(${t.name})`,
    ),
    check("categories_pgc_ck", sql`${t.pgcAccount} is null or ${t.pgcAccount} ~ '^[0-9]{1,10}$'`),
    check("categories_not_self_parent_ck", sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
  ],
);

/**
 * Tercero de una sociedad: cliente, proveedor o ambos (una misma empresa puede
 * comprarnos y vendernos; así su historial queda en un solo sitio).
 */
export const counterparties = pgTable(
  "counterparties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    legalEntityId: uuid("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    name: text("name").notNull(),
    /** Identificador fiscal normalizado. Opcional: particulares o extranjeros sin NIF. */
    taxId: text("tax_id"),
    /** País del identificador (ISO 3166-1). Solo se valida el formato español. */
    taxIdCountry: char("tax_id_country", { length: 2 }).notNull().default("ES"),
    isCustomer: boolean("is_customer").notNull().default(false),
    isSupplier: boolean("is_supplier").notNull().default(false),
    email: text("email"),
    phone: text("phone"),
    /** IBAN normalizado (sin espacios), validado con su dígito de control. */
    iban: text("iban"),
    /** Plazo habitual de cobro o pago en días. */
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    defaultIncomeCategoryId: uuid("default_income_category_id").references(() => categories.id),
    defaultExpenseCategoryId: uuid("default_expense_category_id").references(() => categories.id),
    notes: text("notes"),
    status: recordStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    index("counterparties_entity_idx").on(t.legalEntityId),
    index("counterparties_entity_name_idx").on(t.legalEntityId, sql`lower(${t.name})`),
    uniqueIndex("counterparties_entity_tax_id_uq")
      .on(t.legalEntityId, t.taxIdCountry, t.taxId)
      .where(sql`${t.taxId} is not null`),
    check("counterparties_role_ck", sql`${t.isCustomer} or ${t.isSupplier}`),
    check("counterparties_terms_ck", sql`${t.paymentTermsDays} between 0 and 365`),
  ],
);
