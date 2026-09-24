/**
 * Terceros de una sociedad: clientes, proveedores o ambos.
 */
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { counterparties } from "@/db/schema";
import { withDbContext } from "@/db/tenant";
import { DomainError, pgConstraint, pgErrorCode } from "@/lib/errors";
import { isValidIban, normalizeIban } from "@/lib/iban";
import { validateNif } from "@/lib/nif";
import { assertCan, toDbContext, type AccessContext } from "@/modules/access/context";
import { assertActiveEntity, translateIntegrityError } from "./categories";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

export const counterpartyInput = z
  .object({
    name: z.string().trim().min(2, "Indica el nombre o razón social").max(200),
    taxId: optionalText(30),
    taxIdCountry: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "País no válido")
      .default("ES"),
    isCustomer: z.boolean(),
    isSupplier: z.boolean(),
    email: z
      .string()
      .trim()
      .email("Email no válido")
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
    phone: optionalText(40),
    iban: optionalText(40),
    paymentTermsDays: z.number().int().min(0, "Entre 0 y 365 días").max(365, "Entre 0 y 365 días"),
    defaultIncomeCategoryId: z.string().uuid().nullable().optional(),
    defaultExpenseCategoryId: z.string().uuid().nullable().optional(),
    notes: optionalText(2000),
  })
  .refine((v) => v.isCustomer || v.isSupplier, {
    message: "Marca si es cliente, proveedor o ambos",
    path: ["role"],
  });
export type CounterpartyInput = z.input<typeof counterpartyInput>;

/** Valida y normaliza NIF e IBAN. Devuelve los datos listos para guardar. */
function normalize(input: CounterpartyInput) {
  const data = counterpartyInput.parse(input);
  let taxId = data.taxId;
  if (taxId) {
    if (data.taxIdCountry === "ES") {
      const nif = validateNif(taxId);
      if (!nif.valid) throw new DomainError("El NIF no es válido (revisa la letra o el dígito de control)", "taxId");
      taxId = nif.normalized;
    } else {
      taxId = taxId.toUpperCase().replace(/[\s.\-_/]/g, "");
      if (taxId.startsWith(data.taxIdCountry)) taxId = taxId.slice(2);
    }
  }
  let iban = data.iban;
  if (iban) {
    if (!isValidIban(iban)) throw new DomainError("El IBAN no es válido (revisa los dígitos de control)", "iban");
    iban = normalizeIban(iban);
  }
  return {
    ...data,
    taxId,
    iban,
    // La categoría por defecto solo tiene sentido para el papel correspondiente.
    defaultIncomeCategoryId: data.isCustomer ? (data.defaultIncomeCategoryId ?? null) : null,
    defaultExpenseCategoryId: data.isSupplier ? (data.defaultExpenseCategoryId ?? null) : null,
  };
}

function translate(e: unknown): never {
  if (pgErrorCode(e) === "23505" && pgConstraint(e) === "counterparties_entity_tax_id_uq") {
    throw new DomainError("Ya existe un tercero con ese NIF en esta sociedad", "taxId");
  }
  translateIntegrityError(e);
}

export async function createCounterparty(
  access: AccessContext,
  legalEntityId: string,
  input: CounterpartyInput,
): Promise<string> {
  assertCan(access, "party.write", legalEntityId);
  const data = normalize(input);
  return withDbContext(toDbContext(access), async (tx) => {
    await assertActiveEntity(tx, legalEntityId);
    try {
      const [row] = await tx
        .insert(counterparties)
        .values({ ...data, organizationId: access.orgId, legalEntityId })
        .returning({ id: counterparties.id });
      return row.id;
    } catch (e) {
      translate(e);
    }
  });
}

export async function updateCounterparty(
  access: AccessContext,
  legalEntityId: string,
  counterpartyId: string,
  input: CounterpartyInput,
): Promise<void> {
  assertCan(access, "party.write", legalEntityId);
  const data = normalize(input);
  await withDbContext(toDbContext(access), async (tx) => {
    await assertActiveEntity(tx, legalEntityId);
    try {
      const updated = await tx
        .update(counterparties)
        .set(data)
        .where(and(eq(counterparties.id, counterpartyId), eq(counterparties.legalEntityId, legalEntityId)))
        .returning({ id: counterparties.id });
      if (updated.length === 0) throw new DomainError("Tercero no encontrado");
    } catch (e) {
      if (e instanceof DomainError) throw e;
      translate(e);
    }
  });
}

export async function setCounterpartyStatus(
  access: AccessContext,
  legalEntityId: string,
  counterpartyId: string,
  status: "active" | "archived",
): Promise<void> {
  assertCan(access, "party.write", legalEntityId);
  await withDbContext(toDbContext(access), async (tx) => {
    await assertActiveEntity(tx, legalEntityId);
    const updated = await tx
      .update(counterparties)
      .set({ status })
      .where(and(eq(counterparties.id, counterpartyId), eq(counterparties.legalEntityId, legalEntityId)))
      .returning({ id: counterparties.id });
    if (updated.length === 0) throw new DomainError("Tercero no encontrado");
  });
}

export interface CounterpartyFilter {
  role?: "customer" | "supplier";
  q?: string;
  includeArchived?: boolean;
}

export const LIST_LIMIT = 500;

export async function listCounterparties(
  access: AccessContext,
  legalEntityId: string,
  filter: CounterpartyFilter = {},
) {
  assertCan(access, "entity.view", legalEntityId);
  const q = filter.q?.trim();
  return withDbContext(toDbContext(access), (tx) =>
    tx
      .select({
        id: counterparties.id,
        name: counterparties.name,
        taxId: counterparties.taxId,
        taxIdCountry: counterparties.taxIdCountry,
        isCustomer: counterparties.isCustomer,
        isSupplier: counterparties.isSupplier,
        email: counterparties.email,
        paymentTermsDays: counterparties.paymentTermsDays,
        status: counterparties.status,
      })
      .from(counterparties)
      .where(
        and(
          eq(counterparties.legalEntityId, legalEntityId),
          filter.includeArchived ? undefined : eq(counterparties.status, "active"),
          filter.role === "customer" ? eq(counterparties.isCustomer, true) : undefined,
          filter.role === "supplier" ? eq(counterparties.isSupplier, true) : undefined,
          q
            ? or(
                ilike(counterparties.name, `%${q.replace(/[%_\\]/g, "\\$&")}%`),
                ilike(counterparties.taxId, `%${q.replace(/[\s.\-%_\\]/g, "").toUpperCase()}%`),
              )
            : undefined,
        ),
      )
      .orderBy(asc(counterparties.status), asc(sql`lower(${counterparties.name})`))
      .limit(LIST_LIMIT),
  );
}

export async function getCounterparty(access: AccessContext, legalEntityId: string, counterpartyId: string) {
  assertCan(access, "entity.view", legalEntityId);
  return withDbContext(toDbContext(access), async (tx) => {
    const [row] = await tx
      .select()
      .from(counterparties)
      .where(and(eq(counterparties.id, counterpartyId), eq(counterparties.legalEntityId, legalEntityId)));
    return row ?? null;
  });
}
