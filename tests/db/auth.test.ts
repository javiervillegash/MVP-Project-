import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { getAuth } from "@/lib/auth";
import { createScenario, ownerDb } from "../helpers/db";

const owner = ownerDb();
let S: Awaited<ReturnType<typeof createScenario>>;
let email: string;

beforeAll(async () => {
  S = await createScenario(owner.db, "Auth");
  const { rows } = await owner.pool.query("select email from auth_user where id = $1", [S.users.gestor]);
  email = rows[0].email;
});

afterAll(async () => {
  await closeDb();
  await owner.pool.end();
});

describe("autenticación", () => {
  it("un usuario creado por script puede iniciar sesión con su contraseña", async () => {
    const res = await getAuth().api.signInEmail({
      body: { email, password: S.password },
    });
    expect(res.user.id).toBe(S.users.gestor);
  });

  it("una contraseña incorrecta se rechaza", async () => {
    await expect(
      getAuth().api.signInEmail({
        body: { email, password: "incorrecta-123456" },
      }),
    ).rejects.toThrow();
  });

  it("el registro público está desactivado", async () => {
    await expect(
      getAuth().api.signUpEmail({
        body: {
          email: "nuevo@test.local",
          password: "password-largo-123",
          name: "Nuevo",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("bloqueo por cuenta", () => {
  it("5 contraseñas incorrectas bloquean la cuenta aunque la sexta sea correcta", async () => {
    const { rows } = await owner.pool.query("select email from auth_user where id = $1", [S.users.director]);
    const target = rows[0].email as string;
    for (let i = 0; i < 5; i++) {
      await expect(
        getAuth().api.signInEmail({ body: { email: target, password: `mala-password-${i}` } }),
      ).rejects.toThrow();
    }
    await expect(getAuth().api.signInEmail({ body: { email: target, password: S.password } })).rejects.toMatchObject({
      body: { code: "ACCOUNT_LOCKED" },
    });
    // Pasado el bloqueo (simulado), vuelve a poder entrar y se reinicia el contador.
    await owner.pool.query(
      "update auth_login_lockout set locked_until = now() - interval '1 minute' where email = $1",
      [target],
    );
    const ok = await getAuth().api.signInEmail({ body: { email: target, password: S.password } });
    expect(ok.user.id).toBe(S.users.director);
    const left = await owner.pool.query("select 1 from auth_login_lockout where email = $1", [target]);
    expect(left.rowCount).toBe(0);
  });

  it("un email inexistente se trata igual (no revela si la cuenta existe)", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(
        getAuth().api.signInEmail({ body: { email: "no-existe@test.local", password: "cualquier-cosa-1" } }),
      ).rejects.toThrow();
    }
    await expect(
      getAuth().api.signInEmail({ body: { email: "no-existe@test.local", password: "cualquier-cosa-1" } }),
    ).rejects.toMatchObject({ body: { code: "ACCOUNT_LOCKED" } });
  });
});
