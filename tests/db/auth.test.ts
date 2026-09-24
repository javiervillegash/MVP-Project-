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
