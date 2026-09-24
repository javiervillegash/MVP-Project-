import { NavLinks } from "@/components/nav-links";
import { SignOutButton } from "@/components/sign-out-button";
import { can } from "@/modules/access/context";
import { ROLE_LABELS } from "@/modules/access/labels";
import { requireAccess } from "@/modules/identity/session";

export const dynamic = "force-dynamic";

/**
 * Estructura común: menú lateral + contenido. El menú solo muestra apartados
 * que existen; cada bloque del MVP añadirá los suyos.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, access } = await requireAccess();
  const roleLabel = access.isOrgAdmin
    ? ROLE_LABELS.org_admin
    : [...new Set([...access.entityRoles.values()].flat())].map((r) => ROLE_LABELS[r]).join(" · ");

  const nav = [
    { href: "/", label: "Inicio" },
    ...(can(access, "company.create") ? [{ href: "/clientes", label: "Clientes" }] : []),
    ...(can(access, "org.users.manage") ? [{ href: "/usuarios", label: "Usuarios" }] : []),
    { href: "/seguridad/2fa", label: "Seguridad" },
  ];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-border bg-surface md:w-60 md:border-b-0 md:border-r">
        <div className="px-5 py-5">
          <p className="text-xs font-semibold tracking-wide text-accent">PLATAFORMA FINANCIERA</p>
          <p className="mt-1 truncate text-sm font-medium" title={access.orgName}>
            {access.orgName}
          </p>
        </div>
        <NavLinks items={nav} />
        <div className="mt-auto hidden border-t border-border p-4 md:block">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted">{roleLabel || user.email}</p>
          <div className="mt-3">
            <SignOutButton variant="ghost" />
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">{children}</main>
    </div>
  );
}
