import type { Metadata } from "next";
import { AuthShell } from "@/components/ui/primitives";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Acceso" };

export default function LoginPage() {
  return (
    <AuthShell title="Iniciar sesión" subtitle="Accede con el email y la contraseña que te facilitó tu gestor.">
      <LoginForm />
    </AuthShell>
  );
}
