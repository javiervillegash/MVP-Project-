import { describe, expect, it } from "vitest";
import { add, cents, formatEuros, MoneyError, parseEuros, percentOf, sub } from "@/lib/money";

describe("parseEuros", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234.56", 123456],
    ["1,234.56", 123456],
    ["-12,5", -1250],
    ["12,50-", -1250],
    ["(3,00)", -300],
    ["+7", 700],
    ["1.234", 123400],
    ["1.234.567,89", 123456789],
    ["0,01", 1],
    ["1.234,56 €", 123456],
    [" 99 EUR ", 9900],
  ])("%s → %d céntimos", (input, expected) => {
    expect(parseEuros(input)).toBe(expected);
  });

  it.each(["", "abc", "1,2,3", "12,345", "1.23.4", "1.234,5,6", "12.3456"])("rechaza %j", (input) => {
    expect(() => parseEuros(input)).toThrow(MoneyError);
  });
});

describe("percentOf (IVA y retenciones)", () => {
  it("21 % de 100,00 € = 21,00 €", () => expect(percentOf(cents(10000), 2100)).toBe(2100));
  it("redondea medio céntimo hacia arriba: 21 % de 0,50 € = 0,11 €", () => expect(percentOf(cents(50), 2100)).toBe(11));
  it("redondea medio céntimo alejándose de cero en negativos", () => expect(percentOf(cents(-50), 2100)).toBe(-11));
  it("admite tipos con decimales: recargo 5,2 % de 1.000 €", () => expect(percentOf(cents(100000), 520)).toBe(5200));
  it("retención 15 % de 1.234,57 € = 185,19 €", () => expect(percentOf(cents(123457), 1500)).toBe(18519));
  it("rechaza tipos no enteros en puntos básicos", () => expect(() => percentOf(cents(100), 21.5)).toThrow(MoneyError));
});

describe("aritmética entera", () => {
  it("0,10 + 0,20 = 0,30 exactos", () => expect(add(cents(10), cents(20))).toBe(30));
  it("resta", () => expect(sub(cents(100), cents(250))).toBe(-150));
  it("rechaza decimales", () => expect(() => cents(1.5)).toThrow(MoneyError));
});

describe("formatEuros", () => {
  it("formato español", () => expect(formatEuros(cents(123456)).replace(/\s/g, " ")).toBe("1.234,56 €"));
  it("miles con punto también en importes de 4 cifras", () =>
    expect(formatEuros(cents(100000)).replace(/\s/g, " ")).toBe("1.000,00 €"));
});
