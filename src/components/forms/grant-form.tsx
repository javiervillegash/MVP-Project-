"use client";

import { useActionState } from "react";
import { Alert, Button } from "@/components/ui/primitives";
import type { FormState } from "@/lib/action-state";
import { useFormKey } from "./use-form-key";
import { GrantFields, type ScopeOption } from "./grant-fields";

export function GrantForm({
  action,
  options,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  options: ScopeOption[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formKey = useFormKey(state);
  return (
    <form key={formKey} action={formAction} className="grid max-w-xl gap-4">
      <GrantFields
        options={options}
        errors={state.fieldErrors}
        defaultScope={state.values?.scope}
        defaultRole={state.values?.role}
      />
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="success">Acceso añadido.</Alert>}
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          Añadir acceso
        </Button>
      </div>
    </form>
  );
}
