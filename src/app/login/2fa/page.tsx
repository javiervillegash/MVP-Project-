import type { Metadata } from "next";
import { AuthShell } from "@/components/ui/primitives";
import { TwoFactorForm } from "./two-factor-form";

export const metadata: Metadata = { title: "Verificación en dos pasos" };

export default function TwoFactorPage() {
  return (
    <AuthShell
      title="Verificación en dos pasos"
      subtitle="Introduce el código de 6 dígitos de tu app de autenticación."
    >
      <TwoFactorForm />
    </AuthShell>
  );
}
