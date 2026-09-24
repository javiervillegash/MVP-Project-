import { describe, expect, it } from "vitest";
import { canAddWithinLimit, hasFeature, limitStatus, PLANS } from "@/modules/access/entitlements";

describe("paquetes", () => {
  it("precios base según el modelo de negocio", () => {
    expect(PLANS.esencial.basePriceCents).toBe(45_000);
    expect(PLANS.profesional.basePriceCents).toBe(90_000);
    expect(PLANS.empresa.basePriceCents).toBe(150_000);
    expect(PLANS.finance_department.basePriceCents).toBeNull();
  });

  it("cada paquete incluye todo el anterior", () => {
    const order = ["esencial", "profesional", "empresa", "finance_department"] as const;
    for (let i = 1; i < order.length; i++) {
      for (const f of PLANS[order[i - 1]].features) expect(PLANS[order[i]].features).toContain(f);
    }
  });

  it("presupuesto solo desde Empresa", () => {
    expect(hasFeature({ plan: "profesional" }, "budget")).toBe(false);
    expect(hasFeature({ plan: "empresa" }, "budget")).toBe(true);
    expect(hasFeature({ plan: "profesional", extraFeatures: ["budget"] }, "budget")).toBe(true);
  });

  it("límite de movimientos blando: señala el exceso sin bloquear", () => {
    expect(limitStatus({ plan: "esencial" }, "monthly_transactions", 130)).toEqual({
      used: 130,
      limit: 100,
      over: true,
      excess: 30,
    });
    expect(limitStatus({ plan: "esencial" }, "monthly_transactions", 100).over).toBe(false);
  });

  it("límite de cuentas bancarias duro y personalizable", () => {
    expect(canAddWithinLimit({ plan: "esencial" }, "bank_accounts", 0)).toBe(true);
    expect(canAddWithinLimit({ plan: "esencial" }, "bank_accounts", 1)).toBe(false);
    expect(canAddWithinLimit({ plan: "finance_department" }, "bank_accounts", 50)).toBe(true);
    expect(
      canAddWithinLimit({ plan: "finance_department", limitOverrides: { bank_accounts: 8 } }, "bank_accounts", 8),
    ).toBe(false);
  });
});
