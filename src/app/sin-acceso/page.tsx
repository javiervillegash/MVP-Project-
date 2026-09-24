import type { Metadata } from "next";
import { AuthShell } from "@/components/ui/primitives";
import { SignOutButton } from "@/components/sign-out-button";

export const metadata: Metadata = { title: "Sin acceso" };

export default function NoAccessPage() {
  return (
    <AuthShell
      title="Tu usuario no tiene acceso"
      subtitle="Todavía no tienes ninguna empresa asignada. Pide a tu gestor que te dé acceso."
    >
      <SignOutButton />
    </AuthShell>
  );
}
