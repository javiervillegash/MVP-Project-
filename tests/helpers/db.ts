import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { createCredentialUser } from "@/modules/identity/users";

/** Conexión propietaria (sin RLS) para preparar escenarios de test. */
export function ownerDb() {
  const pool = new Pool({
    connectionString: process.env.MIGRATION_DATABASE_URL,
    max: 2,
  });
  return { db: drizzle(pool, { schema }), pool };
}

export type OwnerDb = ReturnType<typeof ownerDb>["db"];

const uniq = () => Math.random().toString(36).slice(2, 8);

/**
 * Crea una organización con dos clientes y tres sociedades, y un usuario por
 * rol. Devuelve todos los ids para usarlos en las aserciones.
 */
export async function createScenario(db: OwnerDb, label: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.system_actor', 'test', true)`);
    const [org] = await tx
      .insert(schema.organizations)
      .values({ name: `Org ${label}` })
      .returning();
    const [c1, c2] = await tx
      .insert(schema.companies)
      .values([
        { organizationId: org.id, name: `${label} Cliente 1` },
        { organizationId: org.id, name: `${label} Cliente 2` },
      ])
      .returning();
    const [e1a, e1b, e2] = await tx
      .insert(schema.legalEntities)
      .values([
        {
          organizationId: org.id,
          companyId: c1.id,
          legalName: `${label} 1A SL`,
          taxId: `B${uniq()}1`,
          legalForm: "sl",
        },
        {
          organizationId: org.id,
          companyId: c1.id,
          legalName: `${label} 1B SL`,
          taxId: `B${uniq()}2`,
          legalForm: "sl",
        },
        {
          organizationId: org.id,
          companyId: c2.id,
          legalName: `${label} 2 autónomo`,
          taxId: `B${uniq()}3`,
          legalForm: "autonomo",
        },
      ])
      .returning();

    const pw = "test-password-123456";
    const mk = (role: string) =>
      createCredentialUser(tx, {
        email: `${role}-${label}-${uniq()}@test.local`,
        name: `${role} ${label}`,
        password: pw,
      });
    const users = {
      admin: await mk("admin"),
      gestor: await mk("gestor"),
      director: await mk("director"),
      member: await mk("member"),
      gestoria: await mk("gestoria"),
      none: await mk("none"),
    };
    await tx.insert(schema.memberships).values([
      { organizationId: org.id, userId: users.admin, role: "org_admin" },
      {
        organizationId: org.id,
        userId: users.gestor,
        role: "gestor",
        companyId: c1.id,
      },
      {
        organizationId: org.id,
        userId: users.director,
        role: "client_director",
        companyId: c2.id,
      },
      {
        organizationId: org.id,
        userId: users.member,
        role: "client_member",
        legalEntityId: e1b.id,
      },
      {
        organizationId: org.id,
        userId: users.gestoria,
        role: "gestoria",
        legalEntityId: e1a.id,
      },
    ]);
    return {
      org,
      companies: { c1, c2 },
      entities: { e1a, e1b, e2 },
      users,
      password: pw,
    };
  });
}

/**
 * Drizzle envuelve los errores de PostgreSQL ("Failed query: …"); esta ayuda
 * comprueba el mensaje del error original de la base de datos.
 */
export async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  try {
    await promise;
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string } };
    const message = `${err.message ?? ""} ${err.cause?.message ?? ""}`;
    if (!pattern.test(message)) throw new Error(`Error inesperado: ${message}`);
    return;
  }
  throw new Error(`Se esperaba un error ${pattern}, pero la operación se ejecutó`);
}
