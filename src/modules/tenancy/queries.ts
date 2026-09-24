import { asc, eq } from "drizzle-orm";
import { companies, legalEntities } from "@/db/schema";
import { withDbContext } from "@/db/tenant";
import { toDbContext, type AccessContext } from "@/modules/access/context";
import type { Role } from "@/modules/access/permissions";

export interface VisibleEntity {
  id: string;
  legalName: string;
  taxId: string;
  legalForm: string;
  companyName: string;
  roles: readonly Role[];
}

/**
 * Sociedades que el usuario puede ver. No filtra en código: la base de datos
 * (RLS) solo devuelve las que el contexto permite.
 */
export async function listVisibleEntities(access: AccessContext): Promise<VisibleEntity[]> {
  const rows = await withDbContext(toDbContext(access), (tx) =>
    tx
      .select({
        id: legalEntities.id,
        legalName: legalEntities.legalName,
        taxId: legalEntities.taxId,
        legalForm: legalEntities.legalForm,
        companyName: companies.name,
      })
      .from(legalEntities)
      .innerJoin(companies, eq(companies.id, legalEntities.companyId))
      .where(eq(legalEntities.status, "active"))
      .orderBy(asc(companies.name), asc(legalEntities.legalName)),
  );
  return rows.map((r) => ({
    ...r,
    roles: access.isOrgAdmin ? (["org_admin"] as const) : (access.entityRoles.get(r.id) ?? []),
  }));
}
