/**
 * El test más importante del sistema: ninguna organización ni usuario puede
 * ver o modificar datos que no le corresponden, aunque el código olvide un
 * filtro. Se prueba directamente contra PostgreSQL con el usuario de la app.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { companies, legalEntities, memberships, organizations } from "@/db/schema";
import { withDbContext } from "@/db/tenant";
import { resolveAccess, toDbContext } from "@/modules/access/context";
import { listVisibleEntities } from "@/modules/tenancy/queries";
import { createScenario, expectDbError, ownerDb } from "../helpers/db";

const owner = ownerDb();
let A: Awaited<ReturnType<typeof createScenario>>;
let B: Awaited<ReturnType<typeof createScenario>>;

beforeAll(async () => {
  A = await createScenario(owner.db, "A");
  B = await createScenario(owner.db, "B");
});

afterAll(async () => {
  await closeDb();
  await owner.pool.end();
});

async function accessFor(userId: string) {
  const access = await resolveAccess(userId);
  if (!access) throw new Error("sin acceso");
  return access;
}

describe("sin contexto", () => {
  it("las tablas de negocio devuelven cero filas", async () => {
    const db = getDb();
    for (const t of [organizations, companies, legalEntities, memberships]) {
      expect(await db.select().from(t)).toHaveLength(0);
    }
    const { rows } = await db.execute(sql`select count(*)::int as n from audit_log`);
    expect(rows[0].n).toBe(0);
  });
});

describe("Administrador de A", () => {
  it("ve exactamente las 3 sociedades de A y ninguna de B", async () => {
    const access = await accessFor(A.users.admin);
    const ids = (await listVisibleEntities(access)).map((e) => e.id).sort();
    expect(ids).toEqual(
      Object.values(A.entities)
        .map((e) => e.id)
        .sort(),
    );
  });

  it("no encuentra una sociedad de B aunque pida su id", async () => {
    const access = await accessFor(A.users.admin);
    const rows = await withDbContext(toDbContext(access), (tx) =>
      tx.select().from(legalEntities).where(eq(legalEntities.id, B.entities.e1a.id)),
    );
    expect(rows).toHaveLength(0);
  });

  it("no puede modificar una sociedad de B (0 filas afectadas)", async () => {
    const access = await accessFor(A.users.admin);
    const updated = await withDbContext(toDbContext(access), (tx) =>
      tx
        .update(legalEntities)
        .set({ legalName: "hackeada" })
        .where(eq(legalEntities.id, B.entities.e1a.id))
        .returning(),
    );
    expect(updated).toHaveLength(0);
  });

  it("no puede crear datos dentro de B", async () => {
    const access = await accessFor(A.users.admin);
    await expectDbError(
      withDbContext(toDbContext(access), (tx) =>
        tx.insert(companies).values({ organizationId: B.org.id, name: "intrusa" }),
      ),
      /row-level security/,
    );
  });

  it("no puede darse acceso a sí mismo en B", async () => {
    const access = await accessFor(A.users.admin);
    await expectDbError(
      withDbContext(toDbContext(access), (tx) =>
        tx.insert(memberships).values({
          organizationId: B.org.id,
          userId: A.users.admin,
          role: "org_admin",
        }),
      ),
      /row-level security/,
    );
  });

  it("falsificar el contexto con otra organización no sirve si no es miembro", async () => {
    // resolveAccess ignora una organización preferida a la que no pertenece.
    const access = await resolveAccess(A.users.admin, B.org.id);
    expect(access?.orgId).toBe(A.org.id);
  });
});

describe("roles con ámbito limitado", () => {
  it("el gestor del cliente 1 ve sus 2 sociedades y nada más", async () => {
    const access = await accessFor(A.users.gestor);
    expect(access.isOrgAdmin).toBe(false);
    expect(access.requiresTwoFactor).toBe(true);
    const ids = (await listVisibleEntities(access)).map((e) => e.id).sort();
    expect(ids).toEqual([A.entities.e1a.id, A.entities.e1b.id].sort());
  });

  it("el director del cliente 2 ve solo su sociedad y no requiere 2FA", async () => {
    const access = await accessFor(A.users.director);
    expect(access.requiresTwoFactor).toBe(false);
    expect((await listVisibleEntities(access)).map((e) => e.id)).toEqual([A.entities.e2.id]);
  });

  it("la gestoría ve solo la sociedad asignada", async () => {
    const access = await accessFor(A.users.gestoria);
    expect((await listVisibleEntities(access)).map((e) => e.id)).toEqual([A.entities.e1a.id]);
  });

  it("el colaborador ve solo su sociedad", async () => {
    const access = await accessFor(A.users.member);
    expect((await listVisibleEntities(access)).map((e) => e.id)).toEqual([A.entities.e1b.id]);
  });

  it("un usuario sin membresías no tiene acceso", async () => {
    expect(await resolveAccess(A.users.none)).toBeNull();
  });

  it("un gestor solo ve sus propias membresías, no las de los demás", async () => {
    const access = await accessFor(A.users.gestor);
    const rows = await withDbContext(toDbContext(access), (tx) => tx.select().from(memberships));
    expect(rows.map((r) => r.userId)).toEqual([A.users.gestor]);
  });

  it("un gestor no puede ampliar su contexto a sociedades no asignadas", async () => {
    const access = await accessFor(A.users.gestor);
    // Aunque el código añadiera por error otra sociedad al contexto, la
    // membresía no existe: my_grants no la devuelve y el contexto real no la incluye.
    expect(access.entityRoles.has(A.entities.e2.id)).toBe(false);
  });

  it("una sociedad archivada deja de ser visible para el gestor", async () => {
    await owner.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.system_actor', 'test', true)`);
      await tx.update(legalEntities).set({ status: "archived" }).where(eq(legalEntities.id, A.entities.e1b.id));
    });
    const access = await accessFor(A.users.gestor);
    expect([...access.entityRoles.keys()]).toEqual([A.entities.e1a.id]);
  });
});

describe("garantía estructural", () => {
  it("toda tabla con organization_id tiene RLS activado", async () => {
    const { rows } = await owner.pool.query<{ table_name: string }>(`
      select c.table_name
        from information_schema.columns c
        join pg_class k on k.relname = c.table_name
        join pg_namespace n on n.oid = k.relnamespace and n.nspname = c.table_schema
       where c.table_schema = 'public' and c.column_name = 'organization_id' and not k.relrowsecurity
    `);
    expect(rows.map((r) => r.table_name)).toEqual([]);
  });

  it("toda tabla con organization_id está auditada", async () => {
    const { rows } = await owner.pool.query<{ table_name: string }>(`
      select distinct c.table_name
        from information_schema.columns c
       where c.table_schema = 'public' and c.column_name = 'organization_id' and c.table_name <> 'audit_log'
         and not exists (
           select 1 from information_schema.triggers t
            where t.event_object_table = c.table_name and t.trigger_name = 'audit_row')
    `);
    expect(rows.map((r) => r.table_name)).toEqual([]);
  });

  it("el usuario de la aplicación no puede saltarse RLS", async () => {
    const { rows } = await getDb().execute(
      sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
    );
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });
});
