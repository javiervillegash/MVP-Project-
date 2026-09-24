"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ variant = "secondary" }: { variant?: "secondary" | "ghost" }) {
  const router = useRouter();
  return (
    <Button
      variant={variant}
      className="w-full"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      Cerrar sesión
    </Button>
  );
}
