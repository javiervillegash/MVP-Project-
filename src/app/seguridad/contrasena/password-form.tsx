"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";
import type { FormState } from "@/lib/action-state";

export function PasswordForm({ action }: { action: (prev: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Contraseña actual" htmlFor="currentPassword" error={fe.currentPassword}>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field
        label="Nueva contraseña"
        htmlFor="newPassword"
        error={fe.newPassword}
        hint="Al menos 12 caracteres. Una frase larga es más segura y fácil de recordar."
      >
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
      </Field>
      <Field label="Repite la nueva contraseña" htmlFor="confirmPassword" error={fe.confirmPassword}>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="success">Contraseña cambiada. Se han cerrado tus otras sesiones.</Alert>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Guardando…" : "Cambiar contraseña"}
      </Button>
    </form>
  );
}
