/**
 * Validación de identificadores fiscales españoles:
 *   - DNI:  8 dígitos + letra de control           (12345678Z)
 *   - NIE:  X/Y/Z + 7 dígitos + letra de control   (X1234567L)
 *   - CIF/NIF de persona jurídica: letra + 7 dígitos + control (B12345674)
 * Normaliza a mayúsculas sin espacios, puntos ni guiones.
 */
const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
const CIF_CONTROL_LETTERS = "JABCDEFGHI";

export type NifKind = "dni" | "nie" | "cif";

export interface NifResult {
  valid: boolean;
  normalized: string;
  kind?: NifKind;
}

export function normalizeNif(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s.\-_/]/g, "")
    .replace(/^ES/, "");
}

export function validateNif(input: string): NifResult {
  const n = normalizeNif(input);

  if (/^\d{8}[A-Z]$/.test(n)) {
    const ok = DNI_LETTERS[Number(n.slice(0, 8)) % 23] === n[8];
    return { valid: ok, normalized: n, kind: "dni" };
  }

  if (/^[XYZ]\d{7}[A-Z]$/.test(n)) {
    const prefix = { X: "0", Y: "1", Z: "2" }[n[0] as "X" | "Y" | "Z"];
    const ok = DNI_LETTERS[Number(prefix + n.slice(1, 8)) % 23] === n[8];
    return { valid: ok, normalized: n, kind: "nie" };
  }

  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(n)) {
    const digits = n.slice(1, 8);
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const d = Number(digits[i]);
      if (i % 2 === 0) {
        const doubled = d * 2;
        sum += Math.floor(doubled / 10) + (doubled % 10);
      } else {
        sum += d;
      }
    }
    const control = (10 - (sum % 10)) % 10;
    const letter = n[0];
    const given = n[8];
    // Algunas entidades exigen letra, otras dígito; el resto admite ambos.
    const mustBeLetter = "KPQRSNW".includes(letter);
    const mustBeDigit = "ABEH".includes(letter);
    const okDigit = given === String(control);
    const okLetter = given === CIF_CONTROL_LETTERS[control];
    const ok = mustBeLetter ? okLetter : mustBeDigit ? okDigit : okDigit || okLetter;
    return { valid: ok, normalized: n, kind: "cif" };
  }

  return { valid: false, normalized: n };
}
