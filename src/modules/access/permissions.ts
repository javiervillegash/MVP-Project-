/**
 * Matriz de permisos rol × acción. Es la única fuente de verdad: ninguna
 * pantalla ni acción decide permisos por su cuenta, todas llaman a can().
 *
 * Dos tipos de acción:
 *   - de organización: solo el Administrador (crear clientes, precios…)
 *   - de sociedad: dependen del rol que el usuario tenga en ESA sociedad
 */
export const ROLES = ["org_admin", "gestor", "client_director", "client_member", "gestoria"] as const;
export type Role = (typeof ROLES)[number];

export const ORG_ACTIONS = [
  "org.settings",
  "org.users.manage",
  "org.pricing.manage",
  "org.audit.view",
  "company.create",
  "company.archive",
  "entity.create",
  "period.reopen",
  "portfolio.view",
] as const;
export type OrgAction = (typeof ORG_ACTIONS)[number];

export const ENTITY_ACTIONS = [
  "entity.view",
  "entity.settings",
  "party.write",
  "invoice.write",
  "bank.import",
  "reconciliation.write",
  "period.close",
  "document.upload",
  "document.view",
  "report.view",
  "task.write",
  "tax.view",
  "tax.write",
] as const;
export type EntityAction = (typeof ENTITY_ACTIONS)[number];

export type Action = OrgAction | EntityAction;

/** Acciones de sociedad por rol. org_admin puede todo y no aparece aquí. */
export const ENTITY_PERMISSIONS: Record<Exclude<Role, "org_admin">, readonly EntityAction[]> = {
  gestor: [
    "entity.view",
    "entity.settings",
    "party.write",
    "invoice.write",
    "bank.import",
    "reconciliation.write",
    "period.close",
    "document.upload",
    "document.view",
    "report.view",
    "task.write",
    "tax.view",
    "tax.write",
  ],
  client_director: ["entity.view", "document.upload", "document.view", "report.view", "task.write", "tax.view"],
  client_member: ["entity.view", "document.upload", "document.view"],
  // La gestoría solo ve lo que se le comparta (se filtrará por documento en
  // la Fase 2) y registra modelos, fechas e importes comunicados.
  gestoria: ["entity.view", "document.view", "tax.view", "tax.write"],
};

/** Gestor ve el panel de cartera de sus sociedades, aunque no sea admin. */
export const PORTFOLIO_ROLES: readonly Role[] = ["org_admin", "gestor"];

/** Roles con acceso a datos de terceros: 2FA obligatorio. */
export const STAFF_ROLES: readonly Role[] = ["org_admin", "gestor"];

export function isOrgAction(action: Action): action is OrgAction {
  return (ORG_ACTIONS as readonly string[]).includes(action);
}

export function roleAllows(role: Role, action: EntityAction): boolean {
  if (role === "org_admin") return true;
  return ENTITY_PERMISSIONS[role].includes(action);
}
