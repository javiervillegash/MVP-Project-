import { describe, expect, it } from "vitest";
import { formatIban, isValidIban, normalizeIban } from "@/lib/iban";

describe("IBAN", () => {
  it.each([
    "ES9121000418450200051332",
    "ES91 2100 0418 4502 0005 1332",
    "es7921000813610123456789",
    "DE89370400440532013000",
    "GB82WEST12345698765432",
  ])("%s es válido", (iban) => expect(isValidIban(iban)).toBe(true));
  it.each(["ES9121000418450200051333", "ES912100041845020005133", "XX00", "", "ES91-2100"])("%s no es válido", (iban) =>
    expect(isValidIban(iban)).toBe(false),
  );
  it("normaliza y formatea", () => {
    expect(normalizeIban(" es91 2100-0418 4502 0005 1332 ")).toBe("ES9121000418450200051332");
    expect(formatIban("ES9121000418450200051332")).toBe("ES91 2100 0418 4502 0005 1332");
  });
});
