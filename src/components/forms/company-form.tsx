"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui/primitives";
import type { FormState } from "@/lib/action-state";
import { formatEuros, type Cents } from "@/lib/money";
import { PLANS } from "@/modules/access/entitlements";

interface Props {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  staff: { id: string; name: string }[];
  defaults?: {
    name: string;
    plan: string;
    customMonthlyPriceCents: number | null;
    managerUserId: string | null;
  };
  submitLabel: string;
}

const priceText = (c: number | null) => (c ? formatEuros(c as Cents).replace(/\s?€/, "") : "");

export function CompanyForm({ action, staff, defaults, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const [plan, setPlan] = useState(defaults?.plan ?? "esencial");
  const base = PLANS[plan as keyof typeof PLANS];
  const fe = state.fieldErrors ?? {};
  const v = state.values;

  return (
    <form action={formAction} className="grid max-w-xl gap-4">
      <Field
        label="Nombre del cliente"
        htmlFor="name"
        error={fe.name}
        hint="Como lo conocéis internamente, p. ej. «Grupo Alfa»."
      >
        <Input id="name" name="name" required defaultValue={v?.name ?? defaults?.name} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Paquete" htmlFor="plan" error={fe.plan}>
          <Select id="plan" name="plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
            {Object.values(PLANS).map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
                {p.basePriceCents ? ` · ${formatEuros(p.basePriceCents as Cents)}/mes` : " · a medida"}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={plan === "finance_department" ? "Precio pactado (€/mes)" : "Precio pactado (opcional)"}
          htmlFor="customMonthlyPrice"
          error={fe.customMonthlyPriceCents}
          hint={base.basePriceCents ? `Vacío = ${formatEuros(base.basePriceCents as Cents)}` : "Desde 2.000,00 €"}
        >
          <Input
            id="customMonthlyPrice"
            name="customMonthlyPrice"
            inputMode="decimal"
            className="num"
            placeholder="2.500,00"
            defaultValue={v?.customMonthlyPrice ?? priceText(defaults?.customMonthlyPriceCents ?? null)}
            required={plan === "finance_department"}
          />
        </Field>
      </div>
      <Field
        label="Gestor responsable"
        htmlFor="managerUserId"
        error={fe.managerUserId}
        hint="Solo informativo: el acceso se da en Usuarios."
      >
        <Select
          id="managerUserId"
          name="managerUserId"
          defaultValue={v?.managerUserId ?? defaults?.managerUserId ?? ""}
        >
          <option value="">Sin asignar</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && !state.data && <Alert tone="success">Cambios guardados.</Alert>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
