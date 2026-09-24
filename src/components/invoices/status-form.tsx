"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Input } from "@/components/ui/primitives";
import type { FormState } from "@/lib/action-state";

/** Botón que pide un motivo antes de anular / marcar incobrable. */
export function StatusForm({
  action,
  label,
  needsReason,
  danger,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  label: string;
  needsReason?: boolean;
  danger?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [open, setOpen] = useState(false);
  if (needsReason && !open) {
    return (
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className={danger ? "text-danger" : undefined}
      >
        {label}
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {needsReason && (
        <Input name="reason" placeholder="Motivo" required autoFocus className="w-64" aria-label="Motivo" />
      )}
      <Button type="submit" variant="secondary" disabled={pending} className={danger ? "text-danger" : undefined}>
        {needsReason ? "Confirmar" : label}
      </Button>
      {needsReason && (
        <button type="button" className="text-sm text-muted underline" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      )}
      {(state.error || state.fieldErrors?.reason) && <Alert>{state.error ?? state.fieldErrors?.reason}</Alert>}
    </form>
  );
}
