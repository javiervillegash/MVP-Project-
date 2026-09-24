import { describe, expect, it } from "vitest";
import { normalizeNif, validateNif } from "@/lib/nif";

describe("validateNif", () => {
  it.each([
    ["12345678Z", "dni"],
    ["X1234567L", "nie"],
    ["Y1234567X", "nie"],
    ["B12345674", "cif"],
    ["B87654323", "cif"],
    ["Q2826000H", "cif"],
    ["A58818501", "cif"],
  ])("%s es válido (%s)", (nif, kind) => {
    expect(validateNif(nif)).toMatchObject({ valid: true, kind });
  });

  it.each(["12345678A", "X1234567A", "B12345670", "Q2826000J", "1234", "", "ZZZ"])("%s no es válido", (nif) => {
    expect(validateNif(nif).valid).toBe(false);
  });

  it("normaliza espacios, guiones, minúsculas y prefijo ES", () => {
    expect(normalizeNif(" es-b-1234567.4 ")).toBe("B12345674");
    expect(validateNif("b-12345674").valid).toBe(true);
  });
});
