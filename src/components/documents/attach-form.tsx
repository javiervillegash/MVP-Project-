"use client";

import { useActionState } from "react";
import { Alert, Button, Input, Select } from "@/components/ui/primitives";
import type { FormState } from "@/lib/action-state";
import { useFormKey } from "@/components/forms/use-form-key";

export function AttachForm({
  action,
  showFolder,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  showFolder?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const key = useFormKey(state);
  const reused = state.ok && (state.data as { reused?: boolean } | undefined)?.reused;
  return (
    <form key={key} action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {showFolder && (
          <div className="w-40">
            <Select name="folder" defaultValue="facturas" aria-label="Carpeta">
              <option value="facturas">Facturas</option>
              <option value="contratos">Contratos</option>
              <option value="bancos">Bancos</option>
              <option value="gestoria">Gestoría</option>
              <option value="otros">Otros</option>
            </Select>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <Input name="file" type="file" accept="application/pdf,image/*,.xml" required aria-label="Archivo" />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Subiendo…" : "Subir"}
        </Button>
      </div>
      {(state.error || state.fieldErrors?.file) && <Alert>{state.error ?? state.fieldErrors?.file}</Alert>}
      {state.ok && (
        <Alert tone="success">
          {reused ? "Ese archivo ya estaba subido; se ha enlazado el existente." : "Documento subido."}
        </Alert>
      )}
    </form>
  );
}
