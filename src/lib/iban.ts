/**
 * Validación de IBAN (ISO 13616) con el dígito de control módulo 97.
 * Comprueba también la longitud para los países más habituales.
 */
const LENGTHS: Record<string, number> = {
  ES: 24,
  PT: 25,
  FR: 27,
  DE: 22,
  IT: 27,
  NL: 18,
  BE: 16,
  GB: 22,
  IE: 22,
  LU: 20,
  AD: 24,
  CH: 21,
  AT: 20,
};

export function normalizeIban(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export function isValidIban(input: string): boolean {
  const iban = normalizeIban(input);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const expected = LENGTHS[iban.slice(0, 2)];
  if (expected && iban.length !== expected) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of value) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

/** "ES9121000418450200051332" → "ES91 2100 0418 4502 0005 1332" */
export function formatIban(input: string): string {
  return normalizeIban(input)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}
