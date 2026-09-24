/**
 * Cálculo de importes de una factura. Funciones puras: las usa el formulario
 * (para mostrar totales mientras se escribe) y el servidor (que siempre
 * recalcula y es quien manda).
 *
 * Regla: las cuotas de IVA, recargo y retención se calculan sobre la SUMA de
 * bases de cada tipo, no línea a línea, como exige el Reglamento de
 * facturación (art. 6.1.i: cuota por tipo impositivo). Así el resultado
 * coincide con el de los programas de facturación habituales.
 */
import { percentOf, roundHalfAwayFromZero, type Cents } from "@/lib/money";

export interface LineInput {
  /** Cantidad en milésimas (1 unidad = 1000). */
  quantityMilli: number;
  unitPriceCents: number;
  vatRateBp: number;
  surchargeRateBp?: number;
  withholdingRateBp?: number;
}

export interface TaxBreakdown {
  rateBp: number;
  baseCents: number;
  amountCents: number;
}

export interface InvoiceTotals {
  lineBases: number[];
  baseCents: number;
  vatCents: number;
  surchargeCents: number;
  withholdingCents: number;
  totalCents: number;
  vatBreakdown: TaxBreakdown[];
  surchargeBreakdown: TaxBreakdown[];
  withholdingBreakdown: TaxBreakdown[];
}

/** Base de una línea: cantidad × precio, redondeada al céntimo. */
export function lineBase(line: Pick<LineInput, "quantityMilli" | "unitPriceCents">): number {
  const product = BigInt(line.quantityMilli) * BigInt(line.unitPriceCents);
  const q = product / 1000n;
  const r = product % 1000n;
  const absR = r < 0n ? -r : r;
  let result = q;
  if (absR * 2n >= 1000n) result += product < 0n ? -1n : 1n;
  return Number(result);
}

function breakdown(lines: LineInput[], bases: number[], rateOf: (l: LineInput) => number): TaxBreakdown[] {
  const byRate = new Map<number, number>();
  lines.forEach((l, i) => {
    const rate = rateOf(l);
    if (rate > 0) byRate.set(rate, (byRate.get(rate) ?? 0) + bases[i]);
  });
  return [...byRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rateBp, baseCents]) => ({ rateBp, baseCents, amountCents: percentOf(baseCents as Cents, rateBp) }));
}

export function computeTotals(lines: LineInput[]): InvoiceTotals {
  const lineBases = lines.map(lineBase);
  const baseCents = lineBases.reduce((a, b) => a + b, 0);
  const vatBreakdown = breakdown(lines, lineBases, (l) => l.vatRateBp);
  const surchargeBreakdown = breakdown(lines, lineBases, (l) => l.surchargeRateBp ?? 0);
  const withholdingBreakdown = breakdown(lines, lineBases, (l) => l.withholdingRateBp ?? 0);
  const sum = (b: TaxBreakdown[]) => b.reduce((a, x) => a + x.amountCents, 0);
  const vatCents = sum(vatBreakdown);
  const surchargeCents = sum(surchargeBreakdown);
  const withholdingCents = sum(withholdingBreakdown);
  return {
    lineBases,
    baseCents,
    vatCents,
    surchargeCents,
    withholdingCents,
    totalCents: baseCents + vatCents + surchargeCents - withholdingCents,
    vatBreakdown,
    surchargeBreakdown,
    withholdingBreakdown,
  };
}

/** Tipos habituales en España, para los desplegables. */
export const VAT_RATES = [
  { bp: 2100, label: "21 %" },
  { bp: 1000, label: "10 %" },
  { bp: 500, label: "5 %" },
  { bp: 400, label: "4 %" },
  { bp: 0, label: "0 % / exento" },
];
export const SURCHARGE_RATES = [
  { bp: 0, label: "Sin recargo" },
  { bp: 520, label: "5,2 %" },
  { bp: 175, label: "1,75 %" },
  { bp: 140, label: "1,4 %" },
  { bp: 50, label: "0,5 %" },
];
export const WITHHOLDING_RATES = [
  { bp: 0, label: "Sin retención" },
  { bp: 1500, label: "15 %" },
  { bp: 700, label: "7 %" },
  { bp: 1900, label: "19 %" },
  { bp: 100, label: "1 %" },
  { bp: 200, label: "2 %" },
];

/** "1,5" → 1500 milésimas. Admite coma o punto; máx. 3 decimales. */
export function parseQuantity(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (!/^-?\d+(\.\d{1,3})?$/.test(s)) return null;
  return roundHalfAwayFromZero(Number(s) * 1000);
}

export function formatQuantity(milli: number): string {
  return (milli / 1000).toLocaleString("es-ES", { maximumFractionDigits: 3 });
}

export function formatRate(bp: number): string {
  return `${(bp / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })} %`;
}

/** Suma días a una fecha ISO (YYYY-MM-DD) sin problemas de zona horaria. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
