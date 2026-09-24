import { describe, expect, it } from "vitest";
import { addDays, computeTotals, lineBase, parseQuantity } from "@/modules/invoicing/calc";

describe("base de línea", () => {
  it("cantidad × precio, redondeando al céntimo", () => {
    expect(lineBase({ quantityMilli: 1000, unitPriceCents: 12345 })).toBe(12345);
    expect(lineBase({ quantityMilli: 1500, unitPriceCents: 999 })).toBe(1499); // 14,985 → 14,99
    expect(lineBase({ quantityMilli: 333, unitPriceCents: 100 })).toBe(33);
    expect(lineBase({ quantityMilli: -1000, unitPriceCents: 5000 })).toBe(-5000);
  });
});

describe("totales de factura", () => {
  it("factura típica de servicios con IVA 21 % y retención 15 %", () => {
    const t = computeTotals([
      { quantityMilli: 1000, unitPriceCents: 100000, vatRateBp: 2100, withholdingRateBp: 1500 },
    ]);
    expect(t).toMatchObject({ baseCents: 100000, vatCents: 21000, withholdingCents: 15000, totalCents: 106000 });
  });

  it("el IVA se calcula sobre la suma de bases de cada tipo, no línea a línea", () => {
    // Tres líneas de 0,05 €: por línea saldría 3 × 0,01 = 0,03; sobre la suma 0,15 × 21 % = 0,03 (0,0315).
    const lines = Array.from({ length: 3 }, () => ({ quantityMilli: 1000, unitPriceCents: 5, vatRateBp: 2100 }));
    expect(computeTotals(lines).vatCents).toBe(3);
    // Caso donde sí difiere: 7 líneas de 0,07 € → por línea 7 × 0,01 = 0,07; sobre la suma 0,49 × 21 % = 0,10.
    const seven = Array.from({ length: 7 }, () => ({ quantityMilli: 1000, unitPriceCents: 7, vatRateBp: 2100 }));
    expect(computeTotals(seven).vatCents).toBe(10);
  });

  it("varios tipos de IVA y recargo de equivalencia, con desglose", () => {
    const t = computeTotals([
      { quantityMilli: 2000, unitPriceCents: 5000, vatRateBp: 2100, surchargeRateBp: 520 },
      { quantityMilli: 1000, unitPriceCents: 3000, vatRateBp: 1000, surchargeRateBp: 140 },
      { quantityMilli: 1000, unitPriceCents: 2000, vatRateBp: 0 },
    ]);
    expect(t.baseCents).toBe(15000);
    expect(t.vatBreakdown).toEqual([
      { rateBp: 2100, baseCents: 10000, amountCents: 2100 },
      { rateBp: 1000, baseCents: 3000, amountCents: 300 },
    ]);
    expect(t.surchargeCents).toBe(520 + 42);
    expect(t.totalCents).toBe(15000 + 2400 + 562);
  });

  it("rectificativa en negativo", () => {
    const t = computeTotals([{ quantityMilli: -1000, unitPriceCents: 10000, vatRateBp: 2100 }]);
    expect(t.totalCents).toBe(-12100);
  });
});

describe("utilidades", () => {
  it("cantidades con coma o punto", () => {
    expect(parseQuantity("1,5")).toBe(1500);
    expect(parseQuantity("2")).toBe(2000);
    expect(parseQuantity("0.125")).toBe(125);
    expect(parseQuantity("1,2345")).toBeNull();
    expect(parseQuantity("abc")).toBeNull();
  });
  it("vencimiento sumando días, cruzando meses y años bisiestos", () => {
    expect(addDays("2026-01-31", 30)).toBe("2026-03-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-15", 30)).toBe("2027-01-14");
  });
});
