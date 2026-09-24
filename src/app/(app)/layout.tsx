import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
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

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-border bg-surface md:w-60 md:border-b-0 md:border-r">
        <div className="px-5 py-5">
          <p className="text-xs font-semibold tracking-wide text-accent">PLATAFORMA FINANCIERA</p>
          <p className="mt-1 truncate text-sm font-medium" title={access.orgName}>
            {access.orgName}
          </p>
        </div>
        <nav className="flex gap-1 px-3 md:flex-col" aria-label="Principal">
          <Link href="/" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-surface-muted">
            Inicio
          </Link>
          <Link
            href="/seguridad/2fa"
            className="rounded-md px-3 py-2 text-sm text-muted hover:bg-surface-muted hover:text-text"
          >
            Seguridad
          </Link>
        </nav>
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
