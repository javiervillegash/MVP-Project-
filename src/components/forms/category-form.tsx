"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui/primitives";
import type { FormState } from "@/lib/action-state";
import { useFormKey } from "./use-form-key";
import { PL_LINE_LABELS, PL_LINES_BY_KIND, type PlLine } from "@/modules/accounting/category-template";

type Kind = "income" | "expense";

interface Props {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  parents: { id: string; name: string; kind: Kind }[];
  defaults?: { kind: Kind; parentId: string | null; name: string; pgcAccount: string | null; plLine: PlLine };
  /** En edición el tipo no se puede cambiar. */
  lockKind?: boolean;
  submitLabel: string;
  compact?: boolean;
}

export function CategoryForm({ action, parents, defaults, lockKind, submitLabel, compact }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const fe = state.fieldErrors ?? {};
  const v = state.values;
  const [kind, setKind] = useState<Kind>((v?.kind as Kind) ?? defaults?.kind ?? "expense");
  const lines = PL_LINES_BY_KIND[kind];
  // Nueva key en cada respuesta: tras crear queda limpio; tras un error, conserva lo elegido.
  const formKey = useFormKey(state);

  return (
    <form key={formKey} action={formAction} className={compact ? "grid gap-3 sm:grid-cols-2" : "grid max-w-xl gap-4"}>
      {!lockKind && (
        <Field label="Tipo" htmlFor="kind">
          <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
          </Select>
        </Field>
      )}
      {lockKind && <input type="hidden" name="kind" value={kind} />}
      <Field label="Nombre" htmlFor="name" error={fe.name}>
        <Input id="name" name="name" required defaultValue={v?.name ?? defaults?.name} />
      </Field>
      <Field label="Dentro de" htmlFor="parentId" error={fe.parentId} hint="Vacío = categoría principal.">
        <Select id="parentId" name="parentId" defaultValue={v?.parentId ?? defaults?.parentId ?? ""}>
          <option value="">— Principal —</option>
          {parents
            .filter((p) => p.kind === kind)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </Select>
      </Field>
      <Field label="Línea de la cuenta de resultados" htmlFor="plLine" error={fe.plLine}>
        <Select key={kind} id="plLine" name="plLine" defaultValue={v?.plLine ?? defaults?.plLine ?? lines[0]}>
          {lines.map((l) => (
            <option key={l} value={l}>
              {PL_LINE_LABELS[l]}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Cuenta PGC (opcional)"
        htmlFor="pgcAccount"
        error={fe.pgcAccount}
        hint="Orientativa para la gestoría, p. ej. 628."
      >
        <Input
          id="pgcAccount"
          name="pgcAccount"
          inputMode="numeric"
          className="num"
          defaultValue={v?.pgcAccount ?? defaults?.pgcAccount ?? ""}
        />
      </Field>
      <div className={compact ? "flex items-end" : undefined}>
        <Button type="submit" variant={compact ? "secondary" : "primary"} disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </Button>
      </div>
      {state.error && (
        <div className="sm:col-span-2">
          <Alert>{state.error}</Alert>
        </div>
      )}
      {state.ok && !compact && <Alert tone="success">Cambios guardados.</Alert>}
    </form>
  );
}
