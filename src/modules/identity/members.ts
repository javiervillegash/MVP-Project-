/**
 * Usuarios de la organización y sus accesos (Membership).
 * Solo el Administrador puede invitar, asignar o retirar accesos.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { authUser, companies, legalEntities, memberships } from "@/db/schema";
import type { Tx } from "@/db/client";
import { withDbContext } from "@/db/tenant";
import { DomainError, pgErrorCode } from "@/lib/errors";
import { assertCan, toDbContext, type AccessContext } from "@/modules/access/context";
import { ROLES, type Role } from "@/modules/access/permissions";
import { createCredentialUser, generatePassword } from "./users";

export const grantInput = z
  .object({
    role: z.enum(ROLES),
    companyId: z.string().uuid().nullable().optional(),
    legalEntityId: z.string().uuid().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    const scoped = [v.companyId, v.legalEntityId].filter(Boolean).length;
    if (v.role === "org_admin" && scoped > 0) {
      ctx.addIssue({ code: "custom", message: "El Administrador tiene acceso a toda la organización", path: ["role"] });
    }
    if (v.role !== "org_admin" && scoped !== 1) {
      ctx.addIssue({ code: "custom", message: "Elige un cliente o una sociedad concreta", path: ["scope"] });
    }
  });
export type GrantInput = z.infer<typeof grantInput>;

export const inviteInput = z.object({
  name: z.string().trim().min(2, "Indica el nombre").max(120),
  email: z.string().trim().toLowerCase().email("Email no válido"),
});

/** Comprueba que el cliente o la sociedad existen y son de esta organización (RLS). */
async function assertScopeExists(tx: Tx, grant: GrantInput) {
  if (grant.companyId) {
    const [c] = await tx
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.id, grant.companyId), eq(companies.status, "active")));
    if (!c) throw new DomainError("Cliente no encontrado o archivado", "scope");
  }
  if (grant.legalEntityId) {
    const [e] = await tx
      .select({ id: legalEntities.id })
      .from(legalEntities)
      .where(and(eq(legalEntities.id, grant.legalEntityId), eq(legalEntities.status, "active")));
    if (!e) throw new DomainError("Sociedad no encontrada o archivada", "scope");
  }
}

async function insertMembership(tx: Tx, orgId: string, userId: string, grant: GrantInput) {
  try {
    await tx.insert(memberships).values({
      organizationId: orgId,
      userId,
      role: grant.role,
      companyId: grant.companyId ?? null,
      legalEntityId: grant.legalEntityId ?? null,
    });
  } catch (e) {
    if (pgErrorCode(e) === "23505") throw new DomainError("Este usuario ya tiene ese acceso");
    throw e;
  }
}

export interface InviteResult {
  userId: string;
  /** Solo si se ha creado una cuenta nueva: se muestra una vez al Administrador. */
  temporaryPassword: string | null;
}

/**
 * Da acceso a una persona. Si no tiene cuenta, se crea con una contraseña
 * temporal que el Administrador le comunica por un canal seguro. Si ya tiene
 * cuenta (p. ej. en otra organización), solo se le añade el acceso.
 */
export async function inviteUser(
  access: AccessContext,
  person: z.input<typeof inviteInput>,
  grant: GrantInput,
): Promise<InviteResult> {
  assertCan(access, "org.users.manage");
  const who = inviteInput.parse(person);
  const what = grantInput.parse(grant);

  return withDbContext(toDbContext(access), async (tx) => {
    await assertScopeExists(tx, what);
    const [existing] = await tx.select({ id: authUser.id }).from(authUser).where(eq(authUser.email, who.email));
    let userId = existing?.id;
    let temporaryPassword: string | null = null;
    if (!userId) {
      temporaryPassword = generatePassword();
      userId = await createCredentialUser(tx, {
        email: who.email,
        name: who.name,
        password: temporaryPassword,
        mustChangePassword: true,
      });
    }
    await insertMembership(tx, access.orgId, userId, what);
    return { userId, temporaryPassword };
  });
}

export async function addGrant(access: AccessContext, userId: string, grant: GrantInput): Promise<void> {
  assertCan(access, "org.users.manage");
  const what = grantInput.parse(grant);
  await withDbContext(toDbContext(access), async (tx) => {
    await assertScopeExists(tx, what);
    const [member] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.organizationId, access.orgId), eq(memberships.userId, userId)));
    if (!member) throw new DomainError("Usuario no encontrado en la organización");
    await insertMembership(tx, access.orgId, userId, what);
  });
}

/** Retira un acceso. Protege contra quedarse sin ningún Administrador. */
export async function revokeGrant(access: AccessContext, membershipId: string): Promise<void> {
  assertCan(access, "org.users.manage");
  await withDbContext(toDbContext(access), async (tx) => {
    const [m] = await tx.select().from(memberships).where(eq(memberships.id, membershipId));
    if (!m) throw new DomainError("Acceso no encontrado");
    if (m.role === "org_admin") {
      if (m.userId === access.userId) throw new DomainError("No puedes quitarte a ti mismo el rol de Administrador");
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(memberships)
        .where(and(eq(memberships.organizationId, access.orgId), eq(memberships.role, "org_admin")));
      if (n <= 1) throw new DomainError("La organización debe tener al menos un Administrador");
    }
    await tx.delete(memberships).where(eq(memberships.id, membershipId));
  });
}

export interface MemberGrant {
  membershipId: string;
  role: Role;
  companyId: string | null;
  companyName: string | null;
  legalEntityId: string | null;
  legalEntityName: string | null;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  twoFactorEnabled: boolean;
  grants: MemberGrant[];
}

export async function listMembers(access: AccessContext): Promise<Member[]> {
  assertCan(access, "org.users.manage");
  return withDbContext(toDbContext(access), async (tx) => {
    const rows = await tx
      .select({
        membershipId: memberships.id,
        role: memberships.role,
        companyId: memberships.companyId,
        companyName: companies.name,
        legalEntityId: memberships.legalEntityId,
        legalEntityName: legalEntities.legalName,
        userId: authUser.id,
        name: authUser.name,
        email: authUser.email,
        twoFactorEnabled: authUser.twoFactorEnabled,
      })
      .from(memberships)
      .innerJoin(authUser, eq(authUser.id, memberships.userId))
      .leftJoin(companies, eq(companies.id, memberships.companyId))
      .leftJoin(legalEntities, eq(legalEntities.id, memberships.legalEntityId))
      .where(eq(memberships.organizationId, access.orgId))
      .orderBy(asc(authUser.name));

    const byUser = new Map<string, Member>();
    for (const r of rows) {
      const m = byUser.get(r.userId) ?? {
        userId: r.userId,
        name: r.name,
        email: r.email,
        twoFactorEnabled: !!r.twoFactorEnabled,
        grants: [],
      };
      m.grants.push({
        membershipId: r.membershipId,
        role: r.role,
        companyId: r.companyId,
        companyName: r.companyName,
        legalEntityId: r.legalEntityId,
        legalEntityName: r.legalEntityName,
      });
      byUser.set(r.userId, m);
    }
    return [...byUser.values()];
  });
}

export async function getMember(access: AccessContext, userId: string): Promise<Member | null> {
  const all = await listMembers(access);
  return all.find((m) => m.userId === userId) ?? null;
}

/** Opciones de ámbito para los formularios: clientes activos y sus sociedades. */
export async function listScopeOptions(access: AccessContext) {
  return withDbContext(toDbContext(access), async (tx) => {
    const cs = await tx
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.status, "active"))
      .orderBy(asc(companies.name));
    const es = await tx
      .select({ id: legalEntities.id, name: legalEntities.legalName, companyId: legalEntities.companyId })
      .from(legalEntities)
      .where(eq(legalEntities.status, "active"))
      .orderBy(asc(legalEntities.legalName));
    return cs.map((c) => ({ ...c, entities: es.filter((e) => e.companyId === c.id) }));
  });
}
