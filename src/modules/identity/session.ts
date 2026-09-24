import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "@/lib/auth";
import { resolveAccess, type AccessContext } from "@/modules/access/context";

export const ORG_COOKIE = "org";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  twoFactorEnabled: boolean;
}

/** Sesión + acceso de la petición actual (memorizado por petición). */
export const getCurrent = cache(async () => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const user: CurrentUser = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    twoFactorEnabled: !!session.user.twoFactorEnabled,
  };
  const preferredOrg = (await cookies()).get(ORG_COOKIE)?.value;
  const access = await resolveAccess(user.id, preferredOrg);
  return { user, access };
});

/**
 * Para páginas y acciones protegidas: exige sesión, acceso a una
 * organización y 2FA activo si el usuario es del equipo interno.
 */
export async function requireAccess(): Promise<{ user: CurrentUser; access: AccessContext }> {
  const current = await getCurrent();
  if (!current) redirect("/login");
  if (!current.access) redirect("/sin-acceso");
  if (current.access.requiresTwoFactor && !current.user.twoFactorEnabled) {
    redirect("/seguridad/2fa");
  }
  return { user: current.user, access: current.access };
}

/** Solo exige sesión (para la propia pantalla de activar 2FA). */
export async function requireSession(): Promise<{ user: CurrentUser; access: AccessContext | null }> {
  const current = await getCurrent();
  if (!current) redirect("/login");
  return current;
}
