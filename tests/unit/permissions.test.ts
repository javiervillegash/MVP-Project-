import { describe, expect, it } from "vitest";
import { can, type AccessContext } from "@/modules/access/context";
import { ENTITY_ACTIONS, ORG_ACTIONS, type Role } from "@/modules/access/permissions";

const E1 = "00000000-0000-0000-0000-000000000001";
const E2 = "00000000-0000-0000-0000-000000000002";

function ctx(roles: Record<string, Role[]>, isOrgAdmin = false): AccessContext {
  return {
    userId: "u",
    orgId: "o",
    orgName: "Org",
    isOrgAdmin,
    entityRoles: new Map(Object.entries(roles)),
    companyIds: [],
    orgIds: ["o"],
    requiresTwoFactor: false,
  };
}

/**
 * Matriz completa esperada. Si alguien cambia un permiso, este test obliga a
 * cambiarlo aquí también, de forma consciente.
 */
const EXPECTED: Record<Exclude<Role, "org_admin">, string[]> = {
  gestor: [...ENTITY_ACTIONS],
  client_director: ["entity.view", "document.upload", "document.view", "report.view", "task.write", "tax.view"],
  client_member: ["entity.view", "document.upload", "document.view"],
  gestoria: ["entity.view", "document.view", "tax.view", "tax.write"],
};

describe("can()", () => {
  it("el Administrador puede todo, en cualquier sociedad", () => {
    const admin = ctx({}, true);
    for (const a of [...ORG_ACTIONS, ...ENTITY_ACTIONS]) expect(can(admin, a, E1)).toBe(true);
  });

  for (const [role, allowed] of Object.entries(EXPECTED)) {
    describe(role, () => {
      const c = ctx({ [E1]: [role as Role] });
      it.each(ENTITY_ACTIONS.map((a) => [a, allowed.includes(a)] as const))(
        "%s en su sociedad → %s",
        (action, expected) => {
          expect(can(c, action, E1)).toBe(expected);
        },
      );
      it("no puede nada en una sociedad no asignada", () => {
        for (const a of ENTITY_ACTIONS) expect(can(c, a, E2)).toBe(false);
      });
      it("no tiene acciones de organización (salvo panel de cartera el gestor)", () => {
        for (const a of ORG_ACTIONS) expect(can(c, a)).toBe(a === "portfolio.view" && role === "gestor");
      });
    });
  }

  it("una acción de sociedad sin indicar sociedad se deniega", () => {
    expect(can(ctx({ [E1]: ["gestor"] }), "invoice.write")).toBe(false);
  });

  it("varios roles en la misma sociedad suman permisos", () => {
    const c = ctx({ [E1]: ["client_member", "gestoria"] });
    expect(can(c, "tax.write", E1)).toBe(true);
    expect(can(c, "document.upload", E1)).toBe(true);
    expect(can(c, "invoice.write", E1)).toBe(false);
  });
});
