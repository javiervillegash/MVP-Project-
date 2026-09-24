import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/ui/primitives";
import { requireSession } from "@/modules/identity/session";
import { changePasswordAction } from "./actions";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Contraseña" };
export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const { user } = await requireSession();
  return (
    <AuthShell
      title={user.mustChangePassword ? "Elige tu contraseña" : "Cambiar contraseña"}
      subtitle={
        user.mustChangePassword
          ? "Estás usando una contraseña temporal. Cámbiala por una que solo conozcas tú para continuar."
          : undefined
      }
    >
      <PasswordForm action={changePasswordAction} />
      {!user.mustChangePassword && (
        <Link href="/" className="mt-4 inline-block text-sm text-muted underline">
          Volver al inicio
        </Link>
      )}
    </AuthShell>
  );
}
