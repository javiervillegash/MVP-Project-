import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { memberships, organizations } from "@/db/schema";
import { withDbContext, type DbContext } from "@/db/tenant";
import {
  isOrgAction,
  PORTFOLIO_ROLES,
  roleAllows,
  STAFF_ROLES,
  type Action,
  type EntityAction,
  type Role,
} from "./permissions";

/** Lo que un usuario puede hacer dentro de una organización. */
export interface AccessContext {
  userId: string;
  orgId: string;
  orgName: string;
  isOrgAdmin: boolean;
  /** Roles del usuario por sociedad (vacío para el admin: lo ve todo). */
  entityRoles: ReadonlyMap<string, readonly Role[]>;
  companyIds: readonly string[];
  /** Organizaciones a las que pertenece (para el selector). */
  orgIds: readonly string[];
  /** Tiene un rol de equipo interno: 2FA obligatorio. */
  requiresTwoFactor: boolean;
}

export class AccessDeniedError extends Error {
  constructor(message = "No tienes permiso para realizar esta acción") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

/**
 * Resuelve el acceso de un usuario en una organización (la indicada o, si no
 * pertenece a ella o no se indica, la primera). Devuelve null sin acceso.
 */
export async function resolveAccess(
  userId: string,
  preferredOrgId?: string,
  db?: Database,
): Promise<AccessContext | null> {
  // 1) Sin organización fijada, RLS solo deja ver las membresías propias.
  const own = await withDbContext(
    { userId },
    (tx) =>
      tx
        .select({ orgId: memberships.organizationId, role: memberships.role })
        .from(memberships)
        .where(eq(memberships.userId, userId)),
    db,
  );
  if (own.length === 0) return null;

  const orgIds = [...new Set(own.map((m) => m.orgId))].sort();
  const orgId = preferredOrgId && orgIds.includes(preferredOrgId) ? preferredOrgId : orgIds[0];
  const rolesHere = own.filter((m) => m.orgId === orgId).map((m) => m.role as Role);
  const isOrgAdmin = rolesHere.includes("org_admin");

  // 2) Con la organización fijada: datos de la organización y permisos
  //    efectivos por sociedad (app.my_grants solo devuelve los del usuario).
  return withDbContext(
    { userId, orgId },
    async (tx) => {
      const [org] = await tx
        .select({ name: organizations.name })
        .from(organizations)
        .where(and(eq(organizations.id, orgId), eq(organizations.status, "active")));
      if (!org) return null;

      const grants = isOrgAdmin
        ? []
        : (
            await tx.execute<{ role: Role; company_id: string; legal_entity_id: string }>(
              sql`select role, company_id, legal_entity_id from app.my_grants(${orgId}::uuid)`,
            )
          ).rows;

      const entityRoles = new Map<string, Role[]>();
      const companyIds = new Set<string>();
      for (const g of grants) {
        const list = entityRoles.get(g.legal_entity_id) ?? [];
        if (!list.includes(g.role)) list.push(g.role);
        entityRoles.set(g.legal_entity_id, list);
        companyIds.add(g.company_id);
      }

      return {
        userId,
        orgId,
        orgName: org.name,
        isOrgAdmin,
        entityRoles,
        companyIds: [...companyIds],
        orgIds,
        requiresTwoFactor: rolesHere.some((r) => STAFF_ROLES.includes(r)),
      };
    },
    db,
  );
}

/** ¿Puede el usuario hacer `action`? Para acciones de sociedad, indica cuál. */
export function can(ctx: AccessContext, action: Action, legalEntityId?: string): boolean {
  if (ctx.isOrgAdmin) return true;
  if (action === "portfolio.view") {
    return [...ctx.entityRoles.values()].some((roles) => roles.some((r) => PORTFOLIO_ROLES.includes(r)));
  }
  if (isOrgAction(action)) return false;
  if (!legalEntityId) return false;
  const roles = ctx.entityRoles.get(legalEntityId);
  return !!roles?.some((r) => roleAllows(r, action as EntityAction));
}

/** Igual que can(), pero lanza AccessDeniedError. Úsala en acciones de servidor. */
export function assertCan(ctx: AccessContext, action: Action, legalEntityId?: string): void {
  if (!can(ctx, action, legalEntityId)) throw new AccessDeniedError();
}

/** Contexto de base de datos equivalente, para withDbContext(). */
export function toDbContext(ctx: AccessContext, requestId?: string): DbContext {
  return {
    userId: ctx.userId,
    orgId: ctx.orgId,
    orgWide: ctx.isOrgAdmin,
    entityIds: [...ctx.entityRoles.keys()],
    companyIds: ctx.companyIds,
    requestId,
  };
}
