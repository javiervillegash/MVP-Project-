import type { Role } from "./permissions";

export const ROLE_LABELS: Record<Role, string> = {
  org_admin: "Administrador",
  gestor: "Gestor",
  client_director: "Director",
  client_member: "Colaborador",
  gestoria: "Gestoría",
};

export const LEGAL_FORM_LABELS: Record<string, string> = {
  sl: "SL",
  slu: "SLU",
  sa: "SA",
  autonomo: "Autónomo",
  comunidad_bienes: "Comunidad de bienes",
  sociedad_civil: "Sociedad civil",
  cooperativa: "Cooperativa",
  asociacion: "Asociación",
  otra: "Otra",
};

export const PLAN_LABELS: Record<string, string> = {
  esencial: "Esencial",
  profesional: "Profesional",
  empresa: "Empresa",
  finance_department: "Finance Department",
};

export const VAT_REGIME_LABELS: Record<string, string> = {
  general: "General",
  recargo_equivalencia: "Recargo de equivalencia",
  simplificado: "Simplificado",
  criterio_caja: "Criterio de caja",
  exento: "Exento",
};

export const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/** Descripción corta del acceso: "Gestor · Grupo Alfa (cliente)". */
export function describeGrant(g: {
  role: keyof typeof ROLE_LABELS;
  companyName: string | null;
  legalEntityName: string | null;
}): string {
  if (g.role === "org_admin") return "Administrador · toda la organización";
  if (g.companyName) return `${ROLE_LABELS[g.role]} · ${g.companyName} (todas sus sociedades)`;
  return `${ROLE_LABELS[g.role]} · ${g.legalEntityName ?? "sociedad"}`;
}
