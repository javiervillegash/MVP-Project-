"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/action-state";

export function RevokeButton({ action }: { action: (prev: FormState) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="text-right">
      <button type="submit" disabled={pending} className="text-sm text-muted underline hover:text-danger">
        Retirar
      </button>
      {state.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </form>
  );
}
