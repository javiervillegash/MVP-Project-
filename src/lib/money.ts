/**
 * Importes monetarios como ENTEROS en céntimos. Nunca usar números con
 * decimales para dinero: 0.1 + 0.2 !== 0.3.
 *
 * El tipo Cents es un número entero marcado para que TypeScript impida mezclar
 * euros y céntimos por descuido.
 */
export type Cents = number & { readonly __brand: "Cents" };

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`Importe en céntimos no entero o fuera de rango: ${value}`);
  }
  return value as Cents;
}

export const ZERO = cents(0);

export function add(...values: Cents[]): Cents {
  return cents(values.reduce((a, b) => a + b, 0));
}

export function sub(a: Cents, b: Cents): Cents {
  return cents(a - b);
}

export function neg(a: Cents): Cents {
  return cents(-a);
}

/**
 * Redondeo "half away from zero" (el habitual en facturación española):
 * 0,5 céntimos sube a 1; -0,5 baja a -1.
 */
export function roundHalfAwayFromZero(value: number): number {
  const r = Math.round(Math.abs(value) + Number.EPSILON * Math.abs(value));
  return value < 0 ? -r : r;
}

/**
 * Aplica un porcentaje a una base. El porcentaje se expresa en puntos básicos
 * (centésimas de punto) para admitir tipos como 5,2 % del recargo de
 * equivalencia sin decimales: 21 % = 2100, 5,2 % = 520.
 */
export function percentOf(base: Cents, rateBasisPoints: number): Cents {
  if (!Number.isInteger(rateBasisPoints)) {
    throw new MoneyError("El tipo debe expresarse en puntos básicos enteros");
  }
  // base (céntimos) * bp / 10000, con aritmética entera exacta vía BigInt.
  const product = BigInt(base) * BigInt(rateBasisPoints);
  const q = product / 10000n;
  const r = product % 10000n;
  const absR = r < 0n ? -r : r;
  let result = q;
  if (absR * 2n >= 10000n) result += product < 0n ? -1n : 1n;
  return cents(Number(result));
}

/**
 * Convierte texto introducido por el usuario o leído de un extracto en
 * céntimos. Acepta formato español ("1.234,56", "-12,5", "1234,56 €") y
 * formato con punto decimal ("1234.56"). Rechaza lo ambiguo en vez de adivinar.
 */
export function parseEuros(input: string): Cents {
  let s = input.trim().replace(/\s|€|EUR/gi, "");
  if (s === "") throw new MoneyError("Importe vacío");

  let sign = 1;
  if (s.startsWith("(") && s.endsWith(")")) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    sign = -sign;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    sign = -sign;
    s = s.slice(0, -1);
  }

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let intPart: string;
  let decPart = "";

  if (lastComma >= 0 && lastDot >= 0) {
    // El separador que aparece último es el decimal.
    const decSep = lastComma > lastDot ? "," : ".";
    const thouSep = decSep === "," ? "." : ",";
    const parts = s.split(decSep);
    if (parts.length !== 2) throw new MoneyError(`Importe no válido: ${input}`);
    const [i, d] = parts;
    if (!checkThousands(i, thouSep)) throw new MoneyError(`Importe no válido: ${input}`);
    intPart = i.split(thouSep).join("");
    decPart = d;
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    if (parts.length !== 2) throw new MoneyError(`Importe no válido: ${input}`);
    [intPart, decPart] = parts;
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    if (parts.length === 2 && parts[1].length !== 3) {
      [intPart, decPart] = parts; // "1234.56" o "12.5"
    } else if (parts.length >= 2 && checkThousands(s, ".")) {
      // "1.234" o "1.234.567": en España el punto es separador de miles.
      intPart = parts.join("");
    } else {
      throw new MoneyError(`Importe no válido: ${input}`);
    }
  } else {
    intPart = s;
  }

  if (!/^\d+$/.test(intPart) || !/^\d{0,2}$/.test(decPart)) {
    throw new MoneyError(`Importe no válido: ${input}`);
  }
  const value = Number(intPart) * 100 + Number(decPart.padEnd(2, "0") || "0");
  return cents(sign * value);
}

function checkThousands(s: string, sep: string): boolean {
  const groups = s.split(sep);
  if (groups.length === 1) return /^\d+$/.test(groups[0]);
  return /^\d{1,3}$/.test(groups[0]) && groups.slice(1).every((g) => /^\d{3}$/.test(g));
}

const formatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
});

/** 123456 → "1.234,56 €" */
export function formatEuros(value: Cents): string {
  return formatter.format(value / 100);
}
