/**
 * Registro de facturas emitidas y recibidas.
 *
 * El servidor recalcula SIEMPRE los importes a partir de las líneas: lo que
 * envía el navegador solo son cantidades, precios y tipos.
 */
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db/client";
import { counterparties, invoiceLines, invoices } from "@/db/schema";
import { withDbContext } from "@/db/tenant";
import { isValidIsoDate, todayIso } from "@/lib/dates";
import { DomainError, pgConstraint, pgErrorCode } from "@/lib/errors";
import { assertCan, toDbContext, type AccessContext } from "@/modules/access/context";
import { assertActiveEntity, translateIntegrityError } from "@/modules/accounting/categories";
import { countDocumentsFor, storeDocument, type UploadedFile } from "@/modules/documents/service";
import { computeTotals } from "./calc";

export type Direction = "issued" | "received";

const isoDate = z.string().refine(isValidIsoDate, "Fecha no válida");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));
const rate = z.number().int().min(0).max(10000);

export const lineInput = z.object({
  description: z.string().trim().min(1, "Describe la línea").max(500),
  quantityMilli: z
    .number()
    .int()
    .refine((v) => v !== 0, "La cantidad no puede ser 0"),
  unitPriceCents: z.number().int().safe(),
  vatRateBp: rate,
  surchargeRateBp: rate.default(0),
  withholdingRateBp: rate.default(0),
  categoryId: z.string().uuid({ message: "Elige una categoría" }),
});

export const invoiceInput = z
  .object({
    direction: z.enum(["issued", "received"]),
    counterpartyId: z.string().uuid({ message: "Elige el cliente o proveedor" }),
    series: optionalText(20),
    number: z.string().trim().min(1, "Indica el número de factura").max(60),
    issueDate: isoDate,
    operationDate: isoDate.nullable().optional(),
    dueDate: isoDate,
    description: optionalText(500),
    isCorrective: z.boolean().default(false),
    correctedInvoiceId: z.string().uuid().nullable().optional(),
    declaredTotalCents: z.number().int().safe().nullable().optional(),
    notes: optionalText(2000),
    lines: z.array(lineInput).min(1, "Añade al menos una línea").max(200),
  })
  .refine((v) => v.dueDate >= v.issueDate, {
    message: "El vencimiento no puede ser anterior a la fecha",
    path: ["dueDate"],
  });
export type InvoiceInput = z.input<typeof invoiceInput>;

function prepare(input: InvoiceInput) {
  const data = invoiceInput.parse(input);
  const totals = computeTotals(data.lines);
  if (!data.isCorrective && totals.totalCents <= 0) {
    throw new DomainError("El total debe ser positivo. Si es un abono, marca «Factura rectificativa».", "lines");
  }
  if (data.isCorrective && totals.totalCents === 0) {
    throw new DomainError("Una rectificativa no puede tener total 0", "lines");
  }
  return { data, totals };
}

function translate(e: unknown): never {
  if (pgErrorCode(e) === "23505") {
    const c = pgConstraint(e);
    if (c === "invoices_issued_number_uq")
      throw new DomainError("Ya existe una factura emitida con esa serie y número", "number");
    if (c === "invoices_received_number_uq")
      throw new DomainError("Ya está registrada una factura de este proveedor con ese número", "number");
  }
  translateIntegrityError(e);
}

async function insertLines(
  tx: Tx,
  orgId: string,
  entityId: string,
  invoiceId: string,
  data: z.output<typeof invoiceInput>,
) {
  const totals = computeTotals(data.lines);
  await tx.insert(invoiceLines).values(
    data.lines.map((l, i) => ({
      organizationId: orgId,
      legalEntityId: entityId,
      invoiceId,
      position: i + 1,
      description: l.description,
      quantityMilli: l.quantityMilli,
      unitPriceCents: l.unitPriceCents,
      baseCents: totals.lineBases[i],
      vatRateBp: l.vatRateBp,
      surchargeRateBp: l.surchargeRateBp,
      withholdingRateBp: l.withholdingRateBp,
      categoryId: l.categoryId,
    })),
  );
}

function header(data: z.output<typeof invoiceInput>, totals: ReturnType<typeof computeTotals>) {
  return {
    direction: data.direction,
    counterpartyId: data.counterpartyId,
    series: data.series,
    number: data.number,
    issueDate: data.issueDate,
    operationDate: data.operationDate ?? null,
    dueDate: data.dueDate,
    description: data.description,
    isCorrective: data.isCorrective,
    correctedInvoiceId: data.isCorrective ? (data.correctedInvoiceId ?? null) : null,
    baseCents: totals.baseCents,
    vatCents: totals.vatCents,
    surchargeCents: totals.surchargeCents,
    withholdingCents: totals.withholdingCents,
    totalCents: totals.totalCents,
    declaredTotalCents: data.declaredTotalCents ?? null,
    notes: data.notes,
  };
}

export async function createInvoice(
  access: AccessContext,
  legalEntityId: string,
  input: InvoiceInput,
  attachment?: UploadedFile,
): Promise<string> {
  assertCan(access, "invoice.write", legalEntityId);
  const { data, totals } = prepare(input);
  return withDbContext(toDbContext(access), async (tx) => {
    await assertActiveEntity(tx, legalEntityId);
    try {
      const [row] = await tx
        .insert(invoices)
        .values({ ...header(data, totals), organizationId: access.orgId, legalEntityId, createdBy: access.userId })
        .returning({ id: invoices.id });
      await insertLines(tx, access.orgId, legalEntityId, row.id, data);
      if (attachment) {
        await storeDocument(tx, access, legalEntityId, attachment, "facturas", { type: "invoice", id: row.id });
      }
      return row.id;
    } catch (e) {
      if (e instanceof DomainError) throw e;
      translate(e);
    }
  });
}

export async function updateInvoice(
  access: AccessContext,
  legalEntityId: string,
  invoiceId: string,
  input: InvoiceInput,
): Promise<void> {
  assertCan(access, "invoice.write", legalEntityId);
  const { data, totals } = prepare(input);
  await withDbContext(toDbContext(access), async (tx) => {
    await assertActiveEntity(tx, legalEntityId);
    const [current] = await tx
      .select({ status: invoices.status, direction: invoices.direction })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.legalEntityId, legalEntityId)));
    if (!current) throw new DomainError("Factura no encontrada");
    if (current.status === "void") throw new DomainError("Una factura anulada no se puede editar");
    if (current.direction !== data.direction)
      throw new DomainError("No se puede cambiar una factura de emitida a recibida");
    try {
      await tx.update(invoices).set(header(data, totals)).where(eq(invoices.id, invoiceId));
      await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
      await insertLines(tx, access.orgId, legalEntityId, invoiceId, data);
    } catch (e) {
      translate(e);
    }
  });
}

/**
 * Anular (cualquier factura, con motivo), marcar como incobrable (solo
 * emitidas) o volver a activar.
 */
export async function setInvoiceStatus(
  access: AccessContext,
  legalEntityId: string,
  invoiceId: string,
  status: "active" | "uncollectible" | "void",
  reason?: string,
): Promise<void> {
  assertCan(access, "invoice.write", legalEntityId);
  const why = reason?.trim() || null;
  if (status !== "active" && !why) throw new DomainError("Indica el motivo", "reason");
  await withDbContext(toDbContext(access), async (tx) => {
    await assertActiveEntity(tx, legalEntityId);
    const [inv] = await tx
      .select({ direction: invoices.direction })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.legalEntityId, legalEntityId)));
    if (!inv) throw new DomainError("Factura no encontrada");
    if (status === "uncollectible" && inv.direction !== "issued") {
      throw new DomainError("Solo una factura emitida puede ser incobrable");
    }
    await tx
      .update(invoices)
      .set({ status, statusReason: status === "active" ? null : why })
      .where(eq(invoices.id, invoiceId));
  });
}

// ------------------------------------------------------------------ lectura

export type DerivedStatus = "pending" | "overdue" | "uncollectible" | "void";

/** Estado visible. "Cobrada/pagada" y "parcial" llegarán con la conciliación (bloque 6). */
export function derivedStatus(inv: { status: string; dueDate: string }, today = todayIso()): DerivedStatus {
  if (inv.status === "void") return "void";
  if (inv.status === "uncollectible") return "uncollectible";
  return inv.dueDate < today ? "overdue" : "pending";
}

export interface InvoiceFilter {
  direction: Direction;
  state?: "pending" | "overdue" | "void" | "all";
  from?: string;
  to?: string;
  q?: string;
  counterpartyId?: string;
}

export const INVOICE_LIST_LIMIT = 500;

export async function listInvoices(access: AccessContext, legalEntityId: string, f: InvoiceFilter) {
  assertCan(access, "invoice.view", legalEntityId);
  const today = todayIso();
  const q = f.q?.trim();
  return withDbContext(toDbContext(access), async (tx) => {
    const rows = await tx
      .select({
        id: invoices.id,
        series: invoices.series,
        number: invoices.number,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        counterpartyId: invoices.counterpartyId,
        counterpartyName: counterparties.name,
        baseCents: invoices.baseCents,
        vatCents: invoices.vatCents,
        surchargeCents: invoices.surchargeCents,
        withholdingCents: invoices.withholdingCents,
        totalCents: invoices.totalCents,
        declaredTotalCents: invoices.declaredTotalCents,
        isCorrective: invoices.isCorrective,
        status: invoices.status,
      })
      .from(invoices)
      .innerJoin(counterparties, eq(counterparties.id, invoices.counterpartyId))
      .where(
        and(
          eq(invoices.legalEntityId, legalEntityId),
          eq(invoices.direction, f.direction),
          f.from && isValidIsoDate(f.from) ? gte(invoices.issueDate, f.from) : undefined,
          f.to && isValidIsoDate(f.to) ? lte(invoices.issueDate, f.to) : undefined,
          f.counterpartyId ? eq(invoices.counterpartyId, f.counterpartyId) : undefined,
          f.state === "void" ? eq(invoices.status, "void") : undefined,
          f.state === "pending" ? and(eq(invoices.status, "active"), gte(invoices.dueDate, today)) : undefined,
          f.state === "overdue" ? and(eq(invoices.status, "active"), sql`${invoices.dueDate} < ${today}`) : undefined,
          !f.state || f.state === "all" ? inArray(invoices.status, ["active", "uncollectible"]) : undefined,
          q
            ? or(
                ilike(invoices.number, `%${q.replace(/[%_\\]/g, "\\$&")}%`),
                ilike(counterparties.name, `%${q.replace(/[%_\\]/g, "\\$&")}%`),
              )
            : undefined,
        ),
      )
      .orderBy(desc(invoices.issueDate), desc(invoices.createdAt))
      .limit(INVOICE_LIST_LIMIT);
    const docs = await countDocumentsFor(
      tx,
      legalEntityId,
      "invoice",
      rows.map((r) => r.id),
    );
    return rows.map((r) => ({ ...r, derived: derivedStatus(r, today), documents: docs.get(r.id) ?? 0 }));
  });
}

export async function getInvoice(access: AccessContext, legalEntityId: string, invoiceId: string) {
  assertCan(access, "invoice.view", legalEntityId);
  return withDbContext(toDbContext(access), async (tx) => {
    const [inv] = await tx
      .select({ invoice: invoices, counterpartyName: counterparties.name, counterpartyTaxId: counterparties.taxId })
      .from(invoices)
      .innerJoin(counterparties, eq(counterparties.id, invoices.counterpartyId))
      .where(and(eq(invoices.id, invoiceId), eq(invoices.legalEntityId, legalEntityId)));
    if (!inv) return null;
    const lines = await tx
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoiceId))
      .orderBy(asc(invoiceLines.position));
    return {
      ...inv.invoice,
      counterpartyName: inv.counterpartyName,
      counterpartyTaxId: inv.counterpartyTaxId,
      lines,
      derived: derivedStatus(inv.invoice),
      totals: computeTotals(lines),
    };
  });
}

/** Propuesta de siguiente número para una serie de emitidas (p. ej. F-2026-012 → F-2026-013). */
export async function suggestNextNumber(access: AccessContext, legalEntityId: string, series: string | null) {
  assertCan(access, "invoice.view", legalEntityId);
  const [last] = await withDbContext(toDbContext(access), (tx) =>
    tx
      .select({ number: invoices.number })
      .from(invoices)
      .where(
        and(
          eq(invoices.legalEntityId, legalEntityId),
          eq(invoices.direction, "issued"),
          sql`coalesce(${invoices.series}, '') = ${series ?? ""}`,
        ),
      )
      // El número más alto (no el último registrado): primero por longitud y
      // luego alfabéticamente, que ordena bien "2026-009" < "2026-010".
      .orderBy(desc(sql`length(${invoices.number})`), desc(invoices.number))
      .limit(1),
  );
  if (!last) return null;
  const m = last.number.match(/^(.*?)(\d+)$/);
  if (!m) return null;
  return m[1] + String(Number(m[2]) + 1).padStart(m[2].length, "0");
}
