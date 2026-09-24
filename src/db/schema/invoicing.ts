/**
 * Facturas registradas (emitidas y recibidas), sus líneas, apuntes sin
 * factura y documentos adjuntos.
 *
 * El MVP REGISTRA facturas emitidas con otros programas; no las emite
 * (ver ADR 0005). Los campos de serie y huella quedan reservados para la
 * emisión con VERI*FACTU en la Fase 4.
 *
 * Importes en céntimos (bigint); tipos en puntos básicos (21 % = 2100);
 * cantidades en milésimas (1,5 unidades = 1500).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authUser } from "./auth";
import { categories, counterparties } from "./accounting";
import { legalEntities, organizations } from "./tenancy";

const money = (name: string) => bigint(name, { mode: "number" });
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};
const tenant = {
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  legalEntityId: uuid("legal_entity_id")
    .notNull()
    .references(() => legalEntities.id),
};

export const invoiceDirection = pgEnum("invoice_direction", ["issued", "received"]);
/** Estado manual. Pendiente / cobrada / vencida se DERIVAN de fechas y cobros. */
export const invoiceStatus = pgEnum("invoice_status", ["active", "uncollectible", "void"]);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenant,
    direction: invoiceDirection("direction").notNull(),
    counterpartyId: uuid("counterparty_id")
      .notNull()
      .references(() => counterparties.id),
    /** Serie (solo informativa hoy; obligatoria al emitir con VERI*FACTU). */
    series: text("series"),
    number: text("number").notNull(),
    issueDate: date("issue_date", { mode: "string" }).notNull(),
    operationDate: date("operation_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    description: text("description"),
    isCorrective: boolean("is_corrective").notNull().default(false),
    correctedInvoiceId: uuid("corrected_invoice_id"),
    // Totales calculados desde las líneas (agrupando por tipo impositivo).
    baseCents: money("base_cents").notNull(),
    vatCents: money("vat_cents").notNull(),
    surchargeCents: money("surcharge_cents").notNull().default(0),
    withholdingCents: money("withholding_cents").notNull().default(0),
    totalCents: money("total_cents").notNull(),
    /** Total que figura en el documento, si se indica; se avisa si no cuadra. */
    declaredTotalCents: money("declared_total_cents"),
    status: invoiceStatus("status").notNull().default("active"),
    statusReason: text("status_reason"),
    notes: text("notes"),
    /** Reservado para VERI*FACTU (Fase 4): huella encadenada y URL del QR. */
    verifactuHash: text("verifactu_hash"),
    verifactuQrUrl: text("verifactu_qr_url"),
    createdBy: text("created_by").references(() => authUser.id),
    ...timestamps,
  },
  (t) => [
    index("invoices_entity_date_idx").on(t.legalEntityId, t.direction, t.issueDate),
    index("invoices_entity_due_idx").on(t.legalEntityId, t.dueDate),
    index("invoices_counterparty_idx").on(t.counterpartyId),
    // Emitidas: número único por serie en la sociedad.
    uniqueIndex("invoices_issued_number_uq")
      .on(t.legalEntityId, sql`coalesce(${t.series}, '')`, sql`upper(${t.number})`)
      .where(sql`${t.direction} = 'issued'`),
    // Recibidas: número único por proveedor (dos proveedores pueden repetir número).
    uniqueIndex("invoices_received_number_uq")
      .on(t.legalEntityId, t.counterpartyId, sql`upper(${t.number})`)
      .where(sql`${t.direction} = 'received'`),
    check("invoices_due_ck", sql`${t.dueDate} >= ${t.issueDate}`),
    check(
      "invoices_total_ck",
      sql`${t.totalCents} = ${t.baseCents} + ${t.vatCents} + ${t.surchargeCents} - ${t.withholdingCents}`,
    ),
  ],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenant,
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    position: smallint("position").notNull(),
    description: text("description").notNull(),
    /** Cantidad en milésimas: 1 = 1000. */
    quantityMilli: integer("quantity_milli").notNull(),
    unitPriceCents: money("unit_price_cents").notNull(),
    baseCents: money("base_cents").notNull(),
    vatRateBp: integer("vat_rate_bp").notNull(),
    surchargeRateBp: integer("surcharge_rate_bp").notNull().default(0),
    withholdingRateBp: integer("withholding_rate_bp").notNull().default(0),
    categoryId: uuid("category_id").references(() => categories.id),
  },
  (t) => [
    index("invoice_lines_invoice_idx").on(t.invoiceId),
    index("invoice_lines_category_idx").on(t.categoryId),
    check(
      "invoice_lines_rates_ck",
      sql`${t.vatRateBp} between 0 and 10000
      and ${t.surchargeRateBp} between 0 and 10000 and ${t.withholdingRateBp} between 0 and 10000`,
    ),
    check("invoice_lines_qty_ck", sql`${t.quantityMilli} <> 0`),
  ],
);

export const entryKind = pgEnum("entry_kind", ["income", "expense"]);
export const paymentMethod = pgEnum("payment_method", ["bank", "card", "cash", "direct_debit", "other"]);

/**
 * Ingresos y gastos sin factura completa: comisiones bancarias, tickets,
 * seguros sociales, intereses, subvenciones…
 */
export const manualEntries = pgTable(
  "manual_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenant,
    kind: entryKind("kind").notNull(),
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    description: text("description").notNull(),
    counterpartyId: uuid("counterparty_id").references(() => counterparties.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    /** Importe total pagado o cobrado (positivo). */
    amountCents: money("amount_cents").notNull(),
    /** IVA incluido y deducible, si el ticket lo desglosa. */
    vatCents: money("vat_cents").notNull().default(0),
    paymentMethod: paymentMethod("payment_method").notNull().default("bank"),
    status: invoiceStatus("status").notNull().default("active"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => authUser.id),
    ...timestamps,
  },
  (t) => [
    index("manual_entries_entity_date_idx").on(t.legalEntityId, t.entryDate),
    check(
      "manual_entries_amount_ck",
      sql`${t.amountCents} > 0 and ${t.vatCents} >= 0 and ${t.vatCents} < ${t.amountCents}`,
    ),
  ],
);

export const documentFolder = pgEnum("document_folder", ["facturas", "contratos", "bancos", "gestoria", "otros"]);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenant,
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** SHA-256 del contenido: detecta duplicados e integridad. */
    sha256: text("sha256").notNull(),
    /** Ruta en el almacenamiento (nunca pública). */
    storageKey: text("storage_key").notNull(),
    folder: documentFolder("folder").notNull().default("otros"),
    status: invoiceStatus("status").notNull().default("active"),
    uploadedBy: text("uploaded_by").references(() => authUser.id),
    ...timestamps,
  },
  (t) => [
    index("documents_entity_idx").on(t.legalEntityId, t.folder),
    uniqueIndex("documents_entity_sha_uq").on(t.legalEntityId, t.sha256),
    check("documents_size_ck", sql`${t.sizeBytes} > 0`),
  ],
);

export const documentTarget = pgEnum("document_target", ["invoice", "manual_entry", "counterparty"]);

/** Un documento puede estar enlazado a varios elementos (factura, cobro…). */
export const documentLinks = pgTable(
  "document_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenant,
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    targetType: documentTarget("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("document_links_uq").on(t.documentId, t.targetType, t.targetId),
    index("document_links_target_idx").on(t.targetType, t.targetId),
  ],
);
