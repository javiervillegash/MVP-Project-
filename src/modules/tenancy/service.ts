/**
 * Alta y mantenimiento de clientes (Company) y sociedades (LegalEntity).
 * Solo el Administrador de la organización puede usar estas operaciones.
 * Todas se ejecutan dentro de withDbContext: RLS y auditoría se aplican solos.
 */
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { authUser, companies, legalEntities, memberships } from "@/db/schema";
import { withDbContext } from "@/db/tenant";
import { DomainError, pgConstraint, pgErrorCode } from "@/lib/errors";
import { validateNif } from "@/lib/nif";
import { assertCan, toDbContext, type AccessContext } from "@/modules/access/context";

// ------------------------------------------------------------------ esquemas

const PLAN_CODES = ["esencial", "profesional", "empresa", "finance_department"] as const;

export const companyInput = z
  .object({
    name: z.string().trim().min(2, "Indica un nombre de al menos 2 caracteres").max(200),
    plan: z.enum(PLAN_CODES),
    customMonthlyPriceCents: z.number().int().positive().nullable().optional(),
    managerUserId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => v.plan !== "finance_department" || !!v.customMonthlyPriceCents, {
    message: "Finance Department necesita un precio pactado",
    path: ["customMonthlyPriceCents"],
  });
export type CompanyInput = z.infer<typeof companyInput>;

export const LEGAL_FORMS = [
  "sl",
  "slu",
  "sa",
  "autonomo",
  "comunidad_bienes",
  "sociedad_civil",
  "cooperativa",
  "asociacion",
  "otra",
] as const;
export const VAT_REGIMES = ["general", "recargo_equivalencia", "simplificado", "criterio_caja", "exento"] as const;

export const legalEntityInput = z.object({
  legalName: z.string().trim().min(2, "Indica la razón social").max(200),
  taxId: z.string().trim().min(1, "Indica el NIF"),
  legalForm: z.enum(LEGAL_FORMS),
  vatRegime: z.enum(VAT_REGIMES),
  vatFilingFrequency: z.enum(["trimestral", "mensual"]),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
});
export type LegalEntityInput = z.infer<typeof legalEntityInput>;

function checkNif(taxId: string, legalForm: LegalEntityInput["legalForm"]): string {
  const nif = validateNif(taxId);
  if (!nif.valid) throw new DomainError("El NIF no es válido (revisa la letra o el dígito de control)", "taxId");
  if (legalForm === "autonomo" && nif.kind === "cif") {
    throw new DomainError("Un autónomo se identifica con DNI o NIE, no con un NIF de sociedad", "taxId");
  }
  if (legalForm !== "autonomo" && nif.kind !== "cif") {
    throw new DomainError("Una sociedad se identifica con un NIF de persona jurídica (letra inicial)", "taxId");
  }
  return nif.normalized;
}

function translateDbError(e: unknown): never {
  if (pgErrorCode(e) === "23505" && pgConstraint(e) === "legal_entities_org_tax_id_uq") {
    throw new DomainError("Ya existe una sociedad con ese NIF en la organización", "taxId");
  }
  throw e;
}

/** El gestor responsable debe ser Administrador o Gestor de esta organización. */
async function assertStaffMember(
  tx: Parameters<Parameters<typeof withDbContext>[1]>[0],
  orgId: string,
  userId: string,
) {
  const rows = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, orgId),
        eq(memberships.userId, userId),
        inArray(memberships.role, ["org_admin", "gestor"]),
      ),
    );
  if (rows.length === 0) throw new DomainError("El gestor responsable debe ser del equipo", "managerUserId");
}

// ---------------------------------------------------------------- clientes

export async function createCompany(access: AccessContext, input: CompanyInput): Promise<string> {
  assertCan(access, "company.create");
  const data = companyInput.parse(input);
  return withDbContext(toDbContext(access), async (tx) => {
    if (data.managerUserId) await assertStaffMember(tx, access.orgId, data.managerUserId);
    const [row] = await tx
      .insert(companies)
      .values({
        organizationId: access.orgId,
        name: data.name,
        plan: data.plan,
        customMonthlyPriceCents: data.customMonthlyPriceCents ?? null,
        managerUserId: data.managerUserId ?? null,
      })
      .returning({ id: companies.id });
    return row.id;
  });
}

export async function updateCompany(access: AccessContext, companyId: string, input: CompanyInput): Promise<void> {
  assertCan(access, "company.create");
  const data = companyInput.parse(input);
  await withDbContext(toDbContext(access), async (tx) => {
    if (data.managerUserId) await assertStaffMember(tx, access.orgId, data.managerUserId);
    const updated = await tx
      .update(companies)
      .set({
        name: data.name,
        plan: data.plan,
        customMonthlyPriceCents: data.customMonthlyPriceCents ?? null,
        managerUserId: data.managerUserId ?? null,
      })
      .where(eq(companies.id, companyId))
      .returning({ id: companies.id });
    if (updated.length === 0) throw new DomainError("Cliente no encontrado");
  });
}

/** Archiva el cliente y todas sus sociedades. Nada se borra. */
export async function archiveCompany(access: AccessContext, companyId: string): Promise<void> {
  assertCan(access, "company.archive");
  await withDbContext(toDbContext(access), async (tx) => {
    const updated = await tx
      .update(companies)
      .set({ status: "archived" })
      .where(eq(companies.id, companyId))
      .returning({ id: companies.id });
    if (updated.length === 0) throw new DomainError("Cliente no encontrado");
    await tx.update(legalEntities).set({ status: "archived" }).where(eq(legalEntities.companyId, companyId));
  });
}

export async function reactivateCompany(access: AccessContext, companyId: string): Promise<void> {
  assertCan(access, "company.archive");
  await withDbContext(toDbContext(access), async (tx) => {
    const updated = await tx
      .update(companies)
      .set({ status: "active" })
      .where(eq(companies.id, companyId))
      .returning({ id: companies.id });
    if (updated.length === 0) throw new DomainError("Cliente no encontrado");
  });
}

// --------------------------------------------------------------- sociedades

export async function createLegalEntity(
  access: AccessContext,
  companyId: string,
  input: LegalEntityInput,
): Promise<string> {
  assertCan(access, "entity.create");
  const data = legalEntityInput.parse(input);
  const taxId = checkNif(data.taxId, data.legalForm);
  return withDbContext(toDbContext(access), async (tx) => {
    const [company] = await tx
      .select({ id: companies.id, status: companies.status })
      .from(companies)
      .where(eq(companies.id, companyId));
    if (!company) throw new DomainError("Cliente no encontrado");
    if (company.status !== "active") throw new DomainError("El cliente está archivado");
    try {
      const [row] = await tx
        .insert(legalEntities)
        .values({ ...data, taxId, organizationId: access.orgId, companyId })
        .returning({ id: legalEntities.id });
      return row.id;
    } catch (e) {
      translateDbError(e);
    }
  });
}

export async function updateLegalEntity(
  access: AccessContext,
  legalEntityId: string,
  input: LegalEntityInput,
): Promise<void> {
  assertCan(access, "entity.settings", legalEntityId);
  const data = legalEntityInput.parse(input);
  const taxId = checkNif(data.taxId, data.legalForm);
  await withDbContext(toDbContext(access), async (tx) => {
    try {
      const updated = await tx
        .update(legalEntities)
        .set({ ...data, taxId })
        .where(eq(legalEntities.id, legalEntityId))
        .returning({ id: legalEntities.id });
      if (updated.length === 0) throw new DomainError("Sociedad no encontrada");
    } catch (e) {
      translateDbError(e);
    }
  });
}

export async function setLegalEntityStatus(
  access: AccessContext,
  legalEntityId: string,
  status: "active" | "archived",
): Promise<void> {
  assertCan(access, "company.archive");
  await withDbContext(toDbContext(access), async (tx) => {
    if (status === "active") {
      const [row] = await tx
        .select({ companyStatus: companies.status })
        .from(legalEntities)
        .innerJoin(companies, eq(companies.id, legalEntities.companyId))
        .where(eq(legalEntities.id, legalEntityId));
      if (row?.companyStatus === "archived") throw new DomainError("Reactiva antes el cliente");
    }
    const updated = await tx
      .update(legalEntities)
      .set({ status })
      .where(eq(legalEntities.id, legalEntityId))
      .returning({ id: legalEntities.id });
    if (updated.length === 0) throw new DomainError("Sociedad no encontrada");
  });
}

// ---------------------------------------------------------------- consultas

export interface CompanyRow {
  id: string;
  name: string;
  status: "active" | "archived";
  plan: (typeof PLAN_CODES)[number];
  customMonthlyPriceCents: number | null;
  managerUserId: string | null;
  managerName: string | null;
  entityCount: number;
}

export async function listCompanies(access: AccessContext): Promise<CompanyRow[]> {
  return withDbContext(toDbContext(access), async (tx) => {
    const rows = await tx
      .select({
        id: companies.id,
        name: companies.name,
        status: companies.status,
        plan: companies.plan,
        customMonthlyPriceCents: companies.customMonthlyPriceCents,
        managerUserId: companies.managerUserId,
        managerName: authUser.name,
        entityCount: sql<number>`(select count(*)::int from legal_entities le
                                   where le.company_id = ${companies.id} and le.status = 'active')`,
      })
      .from(companies)
      .leftJoin(authUser, eq(authUser.id, companies.managerUserId))
      .orderBy(asc(companies.status), asc(companies.name));
    return rows;
  });
}

export async function getCompany(access: AccessContext, companyId: string) {
  return withDbContext(toDbContext(access), async (tx) => {
    const [company] = await tx
      .select({
        id: companies.id,
        name: companies.name,
        status: companies.status,
        plan: companies.plan,
        customMonthlyPriceCents: companies.customMonthlyPriceCents,
        managerUserId: companies.managerUserId,
        managerName: authUser.name,
      })
      .from(companies)
      .leftJoin(authUser, eq(authUser.id, companies.managerUserId))
      .where(eq(companies.id, companyId));
    if (!company) return null;
    const entities = await tx
      .select()
      .from(legalEntities)
      .where(eq(legalEntities.companyId, companyId))
      .orderBy(asc(legalEntities.status), asc(legalEntities.legalName));
    return { ...company, entities };
  });
}

export async function getLegalEntity(access: AccessContext, legalEntityId: string) {
  return withDbContext(toDbContext(access), async (tx) => {
    const [row] = await tx.select().from(legalEntities).where(eq(legalEntities.id, legalEntityId));
    return row ?? null;
  });
}

/** Personas del equipo (Administrador o Gestor) para elegir gestor responsable. */
export async function listStaff(access: AccessContext) {
  return withDbContext(toDbContext(access), async (tx) =>
    tx
      .selectDistinct({ id: authUser.id, name: authUser.name, email: authUser.email })
      .from(memberships)
      .innerJoin(authUser, eq(authUser.id, memberships.userId))
      .where(and(eq(memberships.organizationId, access.orgId), inArray(memberships.role, ["org_admin", "gestor"])))
      .orderBy(asc(authUser.name)),
  );
}

/** Nº de sociedades activas, para comprobar que existe algo antes de otras altas. */
export async function countActiveEntities(access: AccessContext): Promise<number> {
  return withDbContext(toDbContext(access), async (tx) => {
    const [row] = await tx.select({ n: count() }).from(legalEntities).where(eq(legalEntities.status, "active"));
    return row.n;
  });
}
