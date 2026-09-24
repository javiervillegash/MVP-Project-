import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/ui/primitives";
import { requireSession } from "@/modules/identity/session";
import { EnableTwoFactor } from "./enable-two-factor";

export const metadata: Metadata = { title: "Verificación en dos pasos" };
export const dynamic = "force-dynamic";

export default async function SecurityTwoFactorPage() {
  const { user, access } = await requireSession();

  if (user.twoFactorEnabled) {
    return (
      <AuthShell
        title="Verificación en dos pasos activa"
        subtitle="Tu cuenta pide un código de tu móvil al iniciar sesión."
      >
        <div className="flex gap-4 text-sm">
          <Link href="/" className="font-medium text-accent underline">
            Volver al inicio
          </Link>
          <Link href="/seguridad/contrasena" className="text-muted underline">
            Cambiar contraseña
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Activa la verificación en dos pasos"
      subtitle={
        access?.requiresTwoFactor
          ? "Es obligatoria para el equipo porque accedes a datos financieros de clientes."
          : "Protege tu cuenta con un código de tu móvil además de la contraseña."
      }
    >
      <EnableTwoFactor />
    </AuthShell>
  );
}
