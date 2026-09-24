/**
 * Ningún cambio en datos críticos puede hacerse sin dejar rastro.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { auditLog, legalEntities } from "@/db/schema";
import { withDbContext } from "@/db/tenant";
import { resolveAccess, toDbContext } from "@/modules/access/context";
import { createScenario, expectDbError, ownerDb } from "../helpers/db";

const owner = ownerDb();
let A: Awaited<ReturnType<typeof createScenario>>;
let B: Awaited<ReturnType<typeof createScenario>>;

beforeAll(async () => {
  A = await createScenario(owner.db, "AuditA");
  B = await createScenario(owner.db, "AuditB");
});

afterAll(async () => {
  await closeDb();
  await owner.pool.end();
});

describe("registro automático", () => {
  it("un cambio del gestor queda registrado con usuario, campos y valores antes/después", async () => {
    const access = (await resolveAccess(A.users.gestor))!;
    await withDbContext(toDbContext(access, "req-123"), (tx) =>
      tx.update(legalEntities).set({ legalName: "Nombre corregido SL" }).where(eq(legalEntities.id, A.entities.e1a.id)),
    );

    const [row] = await owner.db
      .select()
      .from(auditLog)
      .where(sql`${auditLog.recordId} = ${A.entities.e1a.id} and ${auditLog.action} = 'UPDATE'`);
    expect(row).toMatchObject({
      actorUserId: A.users.gestor,
      tableName: "legal_entities",
      organizationId: A.org.id,
      legalEntityId: A.entities.e1a.id,
      changedFields: ["legal_name"],
      requestId: "req-123",
    });
    expect((row.before as { legal_name: string }).legal_name).toBe("AuditA 1A SL");
    expect((row.after as { legal_name: string }).legal_name).toBe("Nombre corregido SL");
  });

  it("actualiza updated_at automáticamente", async () => {
    const [before] = await owner.db.select().from(legalEntities).where(eq(legalEntities.id, A.entities.e2.id));
    const access = (await resolveAccess(A.users.admin))!;
    await withDbContext(toDbContext(access), (tx) =>
      tx.update(legalEntities).set({ vatFilingFrequency: "mensual" }).where(eq(legalEntities.id, A.entities.e2.id)),
    );
    const [after] = await owner.db.select().from(legalEntities).where(eq(legalEntities.id, A.entities.e2.id));
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it("un cambio sin usuario responsable se rechaza, incluso con el usuario propietario", async () => {
    await expectDbError(
      owner.db.update(legalEntities).set({ legalName: "sin rastro" }).where(eq(legalEntities.id, A.entities.e1a.id)),
      /sin usuario responsable/,
    );
  });
});

describe("inmutabilidad", () => {
  it("la aplicación no puede escribir, modificar ni borrar la auditoría", async () => {
    const access = (await resolveAccess(A.users.admin))!;
    for (const stmt of [
      sql`insert into audit_log (organization_id, actor_user_id, action, table_name, record_id) values (${A.org.id}, 'x', 'X', 'x', 'x')`,
      sql`update audit_log set actor_user_id = 'otro'`,
      sql`delete from audit_log`,
    ]) {
      await expectDbError(
        withDbContext(toDbContext(access), (tx) => tx.execute(stmt)),
        /permission denied/,
      );
    }
  });

  it("ni siquiera el propietario puede modificar o borrar la auditoría", async () => {
    await expect(owner.pool.query("update audit_log set actor_user_id = 'otro'")).rejects.toThrow(/solo inserción/);
    await expect(owner.pool.query("delete from audit_log")).rejects.toThrow(/solo inserción/);
  });

  it("la aplicación no puede borrar sociedades (se archivan)", async () => {
    const access = (await resolveAccess(A.users.admin))!;
    await expectDbError(
      withDbContext(toDbContext(access), (tx) =>
        tx.delete(legalEntities).where(eq(legalEntities.id, A.entities.e2.id)),
      ),
      /permission denied/,
    );
  });
});

describe("visibilidad de la auditoría", () => {
  it("el Administrador ve solo la auditoría de su organización", async () => {
    const access = (await resolveAccess(A.users.admin))!;
    const rows = await withDbContext(toDbContext(access), (tx) => tx.select().from(auditLog));
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.organizationId))).toEqual(new Set([A.org.id]));
    expect(rows.some((r) => r.organizationId === B.org.id)).toBe(false);
  });

  it("un gestor no ve la auditoría", async () => {
    const access = (await resolveAccess(A.users.gestor))!;
    const rows = await withDbContext(toDbContext(access), (tx) => tx.select().from(auditLog));
    expect(rows).toHaveLength(0);
  });
});
