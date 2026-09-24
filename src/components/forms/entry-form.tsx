"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import type { FormState } from "@/lib/action-state";
import { formatEuros, type Cents } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/modules/invoicing/labels";
import { useFormKey } from "./use-form-key";

type Kind = "income" | "expense";
interface Props {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  categories: { id: string; label: string; kind: Kind }[];
  parties: { id: string; name: string }[];
  today: string;
  defaults?: {
    kind: Kind;
    entryDate: string;
    description: string;
    counterpartyId: string | null;
    categoryId: string;
    amountCents: number;
    vatCents: number;
    paymentMethod: string;
    notes: string | null;
  };
  allowAttachment: boolean;
  submitLabel: string;
  readOnly?: boolean;
}

const euros = (c: number) => (c ? formatEuros(c as Cents).replace(/\s?€/, "") : "");

export function EntryForm({
  action,
  categories,
  parties,
  today,
  defaults,
  allowAttachment,
  submitLabel,
  readOnly,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const formKey = useFormKey(state);
  const v = state.values;
  const fe = state.fieldErrors ?? {};
  const [kind, setKind] = useState<Kind>((v?.kind as Kind) ?? defaults?.kind ?? "expense");

  return (
    <form key={formKey} action={formAction} className="grid max-w-2xl gap-4">
      <fieldset disabled={readOnly} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tipo" htmlFor="kind">
            <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              <option value="expense">Gasto</option>
              <option value="income">Ingreso</option>
            </Select>
          </Field>
          <Field label="Fecha" htmlFor="entryDate" error={fe.entryDate}>
            <Input
              id="entryDate"
              name="entryDate"
              type="date"
              required
              defaultValue={v?.entryDate ?? defaults?.entryDate ?? today}
            />
          </Field>
          <Field label="Forma de pago" htmlFor="paymentMethod">
            <Select
              id="paymentMethod"
              name="paymentMethod"
              defaultValue={v?.paymentMethod ?? defaults?.paymentMethod ?? "bank"}
            >
              {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Descripción" htmlFor="description" error={fe.description}>
          <Input
            id="description"
            name="description"
            required
            defaultValue={v?.description ?? defaults?.description}
            placeholder="Ej.: Comisión mantenimiento cuenta"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Categoría" htmlFor="categoryId" error={fe.categoryId}>
            <Select
              key={kind}
              id="categoryId"
              name="categoryId"
              required
              defaultValue={v?.categoryId ?? defaults?.categoryId ?? ""}
            >
              <option value="">Elige…</option>
              {categories
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Tercero (opcional)" htmlFor="counterpartyId" error={fe.counterpartyId}>
            <Select
              id="counterpartyId"
              name="counterpartyId"
              defaultValue={v?.counterpartyId ?? defaults?.counterpartyId ?? ""}
            >
              <option value="">—</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Importe total (€)" htmlFor="amountCents" error={fe.amountCents}>
            <Input
              id="amountCents"
              name="amountCents"
              inputMode="decimal"
              className="num"
              required
              defaultValue={v?.amountCents ?? euros(defaults?.amountCents ?? 0)}
            />
          </Field>
          <Field
            label="IVA incluido (€, opcional)"
            htmlFor="vatCents"
            error={fe.vatCents}
            hint="Solo si el ticket lo desglosa y es deducible."
          >
            <Input
              id="vatCents"
              name="vatCents"
              inputMode="decimal"
              className="num"
              defaultValue={v?.vatCents ?? euros(defaults?.vatCents ?? 0)}
            />
          </Field>
        </div>
        {allowAttachment && (
          <Field label="Justificante (opcional)" htmlFor="attachment" error={fe.file}>
            <Input id="attachment" name="attachment" type="file" accept="application/pdf,image/*" />
          </Field>
        )}
        <Field label="Notas" htmlFor="notes">
          <Textarea id="notes" name="notes" defaultValue={v?.notes ?? defaults?.notes ?? ""} />
        </Field>
      </fieldset>
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="success">Cambios guardados.</Alert>}
      {!readOnly && (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
