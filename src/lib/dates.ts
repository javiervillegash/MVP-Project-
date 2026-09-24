/**
 * Fechas contables como texto ISO "YYYY-MM-DD" (sin hora ni zona), que es
 * como las guarda PostgreSQL (tipo date). Evita desfases por zona horaria.
 */
export const TIMEZONE = "Europe/Madrid";

/** Hoy en Madrid, "2026-09-24". */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(now);
}

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 1990 && y <= 2100;
}

/** "2026-09-24" → "24/09/2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Primer y último día del mes de una fecha ISO. */
export function monthRange(iso: string): { from: string; to: string } {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}
