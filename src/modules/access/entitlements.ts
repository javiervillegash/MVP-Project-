/**
 * Paquetes comerciales: qué funciones incluye cada uno y sus límites.
 * Es independiente de los permisos: el rol dice qué puede hacer una persona;
 * el paquete dice qué funciones existen para esa sociedad.
 *
 * En la Fase 2 estos valores pasarán a las tablas Plan/Subscription, editables
 * desde el panel de administración; la forma de consultarlos no cambiará.
 */
export const FEATURES = [
  "core", // facturas, gastos, bancos, conciliación básica, documentos, tesorería
  "reconciliation_full",
  "monthly_reporting",
  "tax_forecast",
  "gestoria_module",
  "pnl",
  "balance_sheet",
  "cashflow",
  "budget",
  "treasury_forecast_3m",
  "management_dashboard",
  "management_summary",
  "weekly_cashflow",
] as const;
export type Feature = (typeof FEATURES)[number];

export const LIMITS = ["bank_accounts", "monthly_transactions"] as const;
export type Limit = (typeof LIMITS)[number];

export type PlanCode = "esencial" | "profesional" | "empresa" | "finance_department";

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  /** Precio base mensual en céntimos (null = a medida). */
  basePriceCents: number | null;
  features: readonly Feature[];
  limits: Record<Limit, number | null>; // null = sin límite / a medida
}

const ESENCIAL: readonly Feature[] = ["core"];
const PROFESIONAL: readonly Feature[] = [
  ...ESENCIAL,
  "reconciliation_full",
  "monthly_reporting",
  "tax_forecast",
  "gestoria_module",
];
const EMPRESA: readonly Feature[] = [
  ...PROFESIONAL,
  "pnl",
  "balance_sheet",
  "cashflow",
  "budget",
  "treasury_forecast_3m",
  "management_dashboard",
  "management_summary",
];

export const PLANS: Record<PlanCode, PlanDefinition> = {
  esencial: {
    code: "esencial",
    name: "Esencial",
    basePriceCents: 45_000,
    features: ESENCIAL,
    limits: { bank_accounts: 1, monthly_transactions: 100 },
  },
  profesional: {
    code: "profesional",
    name: "Profesional",
    basePriceCents: 90_000,
    features: PROFESIONAL,
    limits: { bank_accounts: 3, monthly_transactions: 300 },
  },
  empresa: {
    code: "empresa",
    name: "Empresa",
    basePriceCents: 150_000,
    features: EMPRESA,
    limits: { bank_accounts: 5, monthly_transactions: 750 },
  },
  finance_department: {
    code: "finance_department",
    name: "Finance Department",
    basePriceCents: null, // desde 2.000 €/mes, se pacta por cliente
    features: [...EMPRESA, "weekly_cashflow"],
    limits: { bank_accounts: null, monthly_transactions: null },
  },
};

/** Suscripción efectiva: plan + ajustes a medida (Finance Department). */
export interface EffectivePlan {
  plan: PlanCode;
  extraFeatures?: readonly Feature[];
  limitOverrides?: Partial<Record<Limit, number | null>>;
}

export function hasFeature(sub: EffectivePlan, feature: Feature): boolean {
  return PLANS[sub.plan].features.includes(feature) || !!sub.extraFeatures?.includes(feature);
}

export function limitFor(sub: EffectivePlan, limit: Limit): number | null {
  if (sub.limitOverrides && limit in sub.limitOverrides) return sub.limitOverrides[limit] ?? null;
  return PLANS[sub.plan].limits[limit];
}

export interface LimitStatus {
  used: number;
  limit: number | null;
  /** Supera el límite contratado. */
  over: boolean;
  /** Unidades por encima del límite (para facturar el exceso). */
  excess: number;
}

/**
 * Límites BLANDOS: nunca bloquean (bloquear una importación rompería la
 * conciliación del cliente). Devuelven el estado para señalar el exceso en el
 * panel de cartera.
 */
export function limitStatus(sub: EffectivePlan, limit: Limit, used: number): LimitStatus {
  const max = limitFor(sub, limit);
  const excess = max === null ? 0 : Math.max(0, used - max);
  return { used, limit: max, over: excess > 0, excess };
}

/**
 * Límites DUROS: solo para altas que el equipo controla (p. ej. dar de alta
 * una cuenta bancaria más de las contratadas). Devuelve si se permite.
 */
export function canAddWithinLimit(sub: EffectivePlan, limit: Limit, currentCount: number): boolean {
  const max = limitFor(sub, limit);
  return max === null || currentCount < max;
}
