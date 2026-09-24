/**
 * Ingresos y gastos sin factura (comisiones, tickets, seguros sociales…).
 */
import { and, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { z } from "zod";
import { categories, counterparties, manualEntries } from "@/db/schema";
import { withDbContext } from "@/db/tenant";
import { isValidIsoDate } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { assertCan, toDbContext, type AccessContext } from "@/modules/access/context";
import { assertActiveEntity, translateIntegrityError } from "@/modules/accounting/categories";
import { countDocumentsFor, storeDocument, type UploadedFile } from "@/modules/documents/service";

export { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "./labels";
import { PAYMENT_METHODS } from "./labels";

export const entryInput = z
  .object({
    kind: z.enum(["income", "expense"]),
    entryDate: z.string().refine(isValidIsoDate, "Fecha no válida"),
    description: z.string().trim().min(2, "Describe el apunte").max(300),
    counterpartyId: z.string().uuid().nullable().optional(),
    categoryId: z.string().uuid({ message: "Elige una categoría" }),
    amountCents: z.number().int().positive("El importe debe ser positivo").safe(),
    vatCents: z.number().int().min(0).safe().default(0),
    paymentMethod: z.enum(PAYMENT_METHODS).default("bank"),
    notes: z
      .string()
      .trim()
      .max(2000)
      .nullable()
      .optional()
      .transform((v) => v || null),
  })
  .refine((v) => v.vatCents < v.amountCents, { message: "El IVA no puede ser mayor que el total", path: ["vatCents"] });
export type EntryInput = z.input<typeof entryInput>;

export async function createEntry(
  access: AccessContext,
  legalEntityId: string,
  input: EntryInput,
  attachment?: UploadedFile,
): Promise<string> {
  assertCan(access, "invoice.write", legalEntityId);
  const data = entryInput.parse(input);
  return withDbContext(toDbContext(access), async (tx) => {
    await assertActiveEntity(tx, legalEntityId);
    try {
      const [row] = await tx
        .insert(manualEntries)
        .values({
          ...data,
          counterpartyId: data.counterpartyId ?? null,
          organizationId: access.orgId,
          legalEntityId,
          createdBy: access.userId,
        })
        .returning({ id: manualEntries.id });
      if (attachment) {
        await storeDocument(tx, access, legalEntityId, attachment, "facturas", { type: "manual_entry", id: row.id });
      }
      return row.id;
    } catch (e) {
      if (e instanceof DomainError) throw e;
      translateIntegrityError(e);
    }
  });
}

export async function updateEntry(access: AccessContext, legalEntityId: string, entryId: string, input: EntryInput) {
  assertCan(access, "invoice.write", legalEntityId);
  const data = entryInput.parse(input);
  await withDbContext(toDbContext(access), async (tx) => {
    await assertActiveEntity(tx, legalEntityId);
    const [cur] = await tx
      .select({ status: manualEntries.status })
      .from(manualEntries)
      .where(and(eq(manualEntries.id, entryId), eq(manualEntries.legalEntityId, legalEntityId)));
    if (!cur) throw new DomainError("Apunte no encontrado");
    if (cur.status === "void") throw new DomainError("Un apunte anulado no se puede editar");
    try {
      await tx
        .update(manualEntries)
        .set({ ...data, counterpartyId: data.counterpartyId ?? null })
        .where(eq(manualEntries.id, entryId));
    } catch (e) {
      translateIntegrityError(e);
    }
  });
}

export async function setEntryStatus(
  access: AccessContext,
  legalEntityId: string,
  entryId: string,
  status: "active" | "void",
) {
  assertCan(access, "invoice.write", legalEntityId);
  await withDbContext(toDbContext(access), async (tx) => {
    await assertActiveEntity(tx, legalEntityId);
    const updated = await tx
      .update(manualEntries)
      .set({ status })
      .where(and(eq(manualEntries.id, entryId), eq(manualEntries.legalEntityId, legalEntityId)))
      .returning({ id: manualEntries.id });
    if (updated.length === 0) throw new DomainError("Apunte no encontrado");
  });
}

export interface EntryFilter {
  kind?: "income" | "expense";
  from?: string;
  to?: string;
  q?: string;
  includeVoid?: boolean;
}

export async function listEntries(access: AccessContext, legalEntityId: string, f: EntryFilter = {}) {
  assertCan(access, "invoice.view", legalEntityId);
  const q = f.q?.trim();
  return withDbContext(toDbContext(access), async (tx) => {
    const rows = await tx
      .select({
        id: manualEntries.id,
        kind: manualEntries.kind,
        entryDate: manualEntries.entryDate,
        description: manualEntries.description,
        counterpartyName: counterparties.name,
        categoryName: categories.name,
        amountCents: manualEntries.amountCents,
        vatCents: manualEntries.vatCents,
        paymentMethod: manualEntries.paymentMethod,
        status: manualEntries.status,
      })
      .from(manualEntries)
      .innerJoin(categories, eq(categories.id, manualEntries.categoryId))
      .leftJoin(counterparties, eq(counterparties.id, manualEntries.counterpartyId))
      .where(
        and(
          eq(manualEntries.legalEntityId, legalEntityId),
          f.kind ? eq(manualEntries.kind, f.kind) : undefined,
          f.from && isValidIsoDate(f.from) ? gte(manualEntries.entryDate, f.from) : undefined,
          f.to && isValidIsoDate(f.to) ? lte(manualEntries.entryDate, f.to) : undefined,
          f.includeVoid ? undefined : eq(manualEntries.status, "active"),
          q ? ilike(manualEntries.description, `%${q.replace(/[%_\\]/g, "\\$&")}%`) : undefined,
        ),
      )
      .orderBy(desc(manualEntries.entryDate), desc(manualEntries.createdAt))
      .limit(500);
    const docs = await countDocumentsFor(
      tx,
      legalEntityId,
      "manual_entry",
      rows.map((r) => r.id),
    );
    return rows.map((r) => ({ ...r, documents: docs.get(r.id) ?? 0 }));
  });
}

export async function getEntry(access: AccessContext, legalEntityId: string, entryId: string) {
  assertCan(access, "invoice.view", legalEntityId);
  const [row] = await withDbContext(toDbContext(access), (tx) =>
    tx
      .select()
      .from(manualEntries)
      .where(and(eq(manualEntries.id, entryId), eq(manualEntries.legalEntityId, legalEntityId))),
  );
  return row ?? null;
}
