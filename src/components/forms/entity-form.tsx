"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui/primitives";
import type { FormState } from "@/lib/action-state";
import { LEGAL_FORM_LABELS, MONTH_LABELS, VAT_REGIME_LABELS } from "@/modules/access/labels";

interface Props {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaults?: {
    legalName: string;
    taxId: string;
    legalForm: string;
    vatRegime: string;
    vatFilingFrequency: string;
    fiscalYearStartMonth: number;
  };
  submitLabel: string;
  readOnly?: boolean;
}

export function EntityForm({ action, defaults, submitLabel, readOnly }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const fe = state.fieldErrors ?? {};
  const v = state.values;

  return (
    <form action={formAction} className="grid max-w-xl gap-4">
      <fieldset disabled={readOnly} className="grid gap-4">
        <Field label="Razón social o nombre completo" htmlFor="legalName" error={fe.legalName}>
          <Input id="legalName" name="legalName" required defaultValue={v?.legalName ?? defaults?.legalName} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Forma" htmlFor="legalForm" error={fe.legalForm}>
            <Select id="legalForm" name="legalForm" defaultValue={v?.legalForm ?? defaults?.legalForm ?? "sl"}>
              {Object.entries(LEGAL_FORM_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="NIF" htmlFor="taxId" error={fe.taxId} hint="Se valida la letra o dígito de control.">
            <Input
              id="taxId"
              name="taxId"
              required
              className="num uppercase"
              defaultValue={v?.taxId ?? defaults?.taxId}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Régimen de IVA" htmlFor="vatRegime" error={fe.vatRegime}>
            <Select id="vatRegime" name="vatRegime" defaultValue={v?.vatRegime ?? defaults?.vatRegime ?? "general"}>
              {Object.entries(VAT_REGIME_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Declaración de IVA" htmlFor="vatFilingFrequency" error={fe.vatFilingFrequency}>
            <Select
              id="vatFilingFrequency"
              name="vatFilingFrequency"
              defaultValue={v?.vatFilingFrequency ?? defaults?.vatFilingFrequency ?? "trimestral"}
            >
              <option value="trimestral">Trimestral</option>
              <option value="mensual">Mensual</option>
            </Select>
          </Field>
        </div>
        <Field label="Inicio del ejercicio fiscal" htmlFor="fiscalYearStartMonth" error={fe.fiscalYearStartMonth}>
          <Select
            id="fiscalYearStartMonth"
            name="fiscalYearStartMonth"
            defaultValue={v?.fiscalYearStartMonth ?? String(defaults?.fiscalYearStartMonth ?? 1)}
          >
            {MONTH_LABELS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
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
