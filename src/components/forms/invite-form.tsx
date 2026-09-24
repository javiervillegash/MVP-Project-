"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, Button, Card, Field, Input } from "@/components/ui/primitives";
import type { FormState } from "@/lib/action-state";
import type { InviteData } from "@/app/(app)/usuarios/actions";
import { GrantFields, type ScopeOption } from "./grant-fields";

export function InviteForm({
  action,
  options,
  defaultScope,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  options: ScopeOption[];
  defaultScope?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const done = state.ok ? (state.data as InviteData) : null;

  if (done) {
    return (
      <Card className="max-w-xl space-y-4 p-6">
        <Alert tone="success">Acceso concedido a {done.name}.</Alert>
        {done.temporaryPassword ? (
          <>
            <p className="text-sm">
              Se ha creado su cuenta. Comunícale estos datos por un canal seguro (en persona o por teléfono, no en el
              mismo email). <strong>La contraseña no se volverá a mostrar.</strong>
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md bg-surface-muted p-3 text-sm">
              <dt className="text-muted">Email</dt>
              <dd className="font-mono">{done.email}</dd>
              <dt className="text-muted">Contraseña</dt>
              <dd className="num font-mono select-all">{done.temporaryPassword}</dd>
            </dl>
          </>
        ) : (
          <p className="text-sm">Esta persona ya tenía cuenta: entrará con su contraseña de siempre.</p>
        )}
        <div className="flex gap-3">
          <Link href={`/usuarios/${done.userId}`} className="text-sm font-medium text-accent underline">
            Ver sus accesos
          </Link>
          <Link href="/usuarios" className="text-sm text-muted underline">
            Volver a usuarios
          </Link>
        </div>
      </Card>
    );
  }

  const fe = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="grid max-w-xl gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre y apellidos" htmlFor="name" error={fe.name}>
          <Input id="name" name="name" required defaultValue={state.values?.name} />
        </Field>
        <Field label="Email" htmlFor="email" error={fe.email}>
          <Input id="email" name="email" type="email" required defaultValue={state.values?.email} />
        </Field>
      </div>
      <GrantFields
        options={options}
        errors={fe}
        defaultScope={state.values?.scope ?? defaultScope}
        defaultRole={state.values?.role}
      />
      {state.error && <Alert>{state.error}</Alert>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Dar acceso"}
        </Button>
      </div>
    </form>
  );
}
