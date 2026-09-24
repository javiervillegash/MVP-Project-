import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { getAuth } from "@/lib/auth";
import { AccessDeniedError, resolveAccess } from "@/modules/access/context";
import { addGrant, inviteUser, listMembers, revokeGrant } from "@/modules/identity/members";
import { createScenario, ownerDb } from "../helpers/db";

const owner = ownerDb();
let A: Awaited<ReturnType<typeof createScenario>>;
let B: Awaited<ReturnType<typeof createScenario>>;

beforeAll(async () => {
  A = await createScenario(owner.db, "MemA");
  B = await createScenario(owner.db, "MemB");
});
afterAll(async () => {
  await closeDb();
  await owner.pool.end();
});

const access = async (userId: string) => (await resolveAccess(userId))!;

describe("invitar usuarios", () => {
  it("crea la cuenta con contraseña temporal y el acceso pedido; puede entrar con ella", async () => {
    const admin = await access(A.users.admin);
    const res = await inviteUser(
      admin,
      { name: "Nueva Directora", email: "Nueva.Directora@Cliente.es" },
      { role: "client_director", companyId: A.companies.c1.id },
    );
    expect(res.temporaryPassword).toHaveLength(20);

    const login = await getAuth().api.signInEmail({
      body: { email: "nueva.directora@cliente.es", password: res.temporaryPassword! },
    });
    expect(login.user.id).toBe(res.userId);

    const newAccess = await access(res.userId);
    expect([...newAccess.entityRoles.keys()].sort()).toEqual([A.entities.e1a.id, A.entities.e1b.id].sort());
  });

  it("si la persona ya tiene cuenta, solo añade el acceso y no cambia su contraseña", async () => {
    const adminB = await access(B.users.admin);
    const { rows } = await owner.pool.query("select email from auth_user where id = $1", [A.users.gestor]);
    const res = await inviteUser(
      adminB,
      { name: "da igual", email: rows[0].email },
      { role: "gestoria", legalEntityId: B.entities.e2.id },
    );
    expect(res).toEqual({ userId: A.users.gestor, temporaryPassword: null });
    // Pertenece a dos organizaciones; en cada una ve solo lo suyo.
    const inB = (await resolveAccess(A.users.gestor, B.org.id))!;
    expect([...inB.entityRoles.keys()]).toEqual([B.entities.e2.id]);
    const inA = (await resolveAccess(A.users.gestor, A.org.id))!;
    expect(inA.entityRoles.has(B.entities.e2.id)).toBe(false);
  });

  it("exige ámbito para roles que no son Administrador", async () => {
    const admin = await access(A.users.admin);
    await expect(inviteUser(admin, { name: "Sin ámbito", email: "sin@ambito.es" }, { role: "gestor" })).rejects.toThrow(
      /cliente o una sociedad/,
    );
  });

  it("no permite dar acceso a una sociedad de otra organización", async () => {
    const admin = await access(A.users.admin);
    await expect(
      inviteUser(
        admin,
        { name: "Intruso", email: "intruso@x.es" },
        { role: "gestor", legalEntityId: B.entities.e1a.id },
      ),
    ).rejects.toThrow(/no encontrada/);
  });

  it("solo el Administrador puede invitar", async () => {
    await expect(
      inviteUser(
        await access(A.users.gestor),
        { name: "X", email: "x@x.es" },
        { role: "gestor", companyId: A.companies.c1.id },
      ),
    ).rejects.toThrow(AccessDeniedError);
  });
});

describe("gestionar accesos", () => {
  it("añade y retira accesos; el usuario deja de ver la sociedad", async () => {
    const admin = await access(A.users.admin);
    await addGrant(admin, A.users.member, { role: "client_member", legalEntityId: A.entities.e2.id });
    expect((await access(A.users.member)).entityRoles.has(A.entities.e2.id)).toBe(true);

    const member = (await listMembers(admin)).find((m) => m.userId === A.users.member)!;
    const grant = member.grants.find((g) => g.legalEntityId === A.entities.e2.id)!;
    await revokeGrant(admin, grant.membershipId);
    expect((await access(A.users.member)).entityRoles.has(A.entities.e2.id)).toBe(false);
  });

  it("no permite duplicar el mismo acceso", async () => {
    const admin = await access(A.users.admin);
    await expect(addGrant(admin, A.users.gestor, { role: "gestor", companyId: A.companies.c1.id })).rejects.toThrow(
      /ya tiene ese acceso/,
    );
  });

  it("protege al último Administrador y a uno mismo", async () => {
    const admin = await access(A.users.admin);
    const me = (await listMembers(admin)).find((m) => m.userId === A.users.admin)!;
    await expect(revokeGrant(admin, me.grants[0].membershipId)).rejects.toThrow(/a ti mismo/);
  });

  it("el listado solo muestra personas de la propia organización", async () => {
    const members = await listMembers(await access(A.users.admin));
    const ids = new Set(members.map((m) => m.userId));
    expect(ids.has(B.users.admin)).toBe(false);
    expect(ids.has(A.users.director)).toBe(true);
  });
});

describe("contraseña temporal", () => {
  it("una cuenta invitada debe cambiar la contraseña; al cambiarla se quita la obligación", async () => {
    const admin = await access(A.users.admin);
    const res = await inviteUser(
      admin,
      { name: "Temporal", email: "temporal@cliente.es" },
      { role: "client_member", legalEntityId: A.entities.e1a.id },
    );
    const flag = async () =>
      (await owner.pool.query("select must_change_password from auth_user where id = $1", [res.userId])).rows[0]
        .must_change_password;
    expect(await flag()).toBe(true);

    const login = await getAuth().api.signInEmail({
      body: { email: "temporal@cliente.es", password: res.temporaryPassword! },
      returnHeaders: true,
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const headers = new Headers({ cookie });

    const { changeOwnPassword } = await import("@/modules/identity/password");
    await expect(
      changeOwnPassword(res.userId, headers, {
        currentPassword: "incorrecta-000000",
        newPassword: "una-frase-nueva-larga",
        confirmPassword: "una-frase-nueva-larga",
      }),
    ).rejects.toThrow(/actual no es correcta/);
    await changeOwnPassword(res.userId, headers, {
      currentPassword: res.temporaryPassword!,
      newPassword: "una-frase-nueva-larga",
      confirmPassword: "una-frase-nueva-larga",
    });
    expect(await flag()).toBe(false);
    const again = await getAuth().api.signInEmail({
      body: { email: "temporal@cliente.es", password: "una-frase-nueva-larga" },
    });
    expect(again.user.id).toBe(res.userId);
  });
});
