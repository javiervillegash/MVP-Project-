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
