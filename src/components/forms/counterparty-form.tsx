"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Checkbox, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import type { FormState } from "@/lib/action-state";
import { useFormKey } from "./use-form-key";
import { formatIban } from "@/lib/iban";

type Option = { id: string; label: string };

interface Props {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  incomeCategories: Option[];
  expenseCategories: Option[];
  defaults?: {
    name: string;
    taxId: string | null;
    taxIdCountry: string;
    isCustomer: boolean;
    isSupplier: boolean;
    email: string | null;
    phone: string | null;
    iban: string | null;
    paymentTermsDays: number;
    defaultIncomeCategoryId: string | null;
    defaultExpenseCategoryId: string | null;
    notes: string | null;
  };
  presetRole?: "customer" | "supplier";
  submitLabel: string;
  readOnly?: boolean;
}

export function CounterpartyForm({
  action,
  incomeCategories,
  expenseCategories,
  defaults,
  presetRole,
  submitLabel,
  readOnly,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const formKey = useFormKey(state);
  const fe = state.fieldErrors ?? {};
  const v = state.values;
  const [isCustomer, setIsCustomer] = useState(
    v ? v.isCustomer === "on" : (defaults?.isCustomer ?? presetRole === "customer"),
  );
  const [isSupplier, setIsSupplier] = useState(
    v ? v.isSupplier === "on" : (defaults?.isSupplier ?? presetRole !== "customer"),
  );

  return (
    <form key={formKey} action={formAction} className="grid max-w-2xl gap-4">
      <fieldset disabled={readOnly} className="grid gap-4">
        <Field label="Nombre o razón social" htmlFor="name" error={fe.name}>
          <Input id="name" name="name" required defaultValue={v?.name ?? defaults?.name} />
        </Field>
        <div>
          <p className="mb-1 text-sm font-medium">Es…</p>
          <div className="flex gap-6">
            <Checkbox
              label="Cliente"
              name="isCustomer"
              checked={isCustomer}
              onChange={(e) => setIsCustomer(e.target.checked)}
            />
            <Checkbox
              label="Proveedor"
              name="isSupplier"
              checked={isSupplier}
              onChange={(e) => setIsSupplier(e.target.checked)}
            />
          </div>
          {fe.role && <p className="mt-1 text-xs text-danger">{fe.role}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label="NIF / identificador fiscal" htmlFor="taxId" error={fe.taxId} hint="Opcional para particulares.">
            <Input id="taxId" name="taxId" className="num uppercase" defaultValue={v?.taxId ?? defaults?.taxId ?? ""} />
          </Field>
          <Field label="País" htmlFor="taxIdCountry" error={fe.taxIdCountry}>
            <Input
              id="taxIdCountry"
              name="taxIdCountry"
              maxLength={2}
              className="uppercase"
              defaultValue={v?.taxIdCountry ?? defaults?.taxIdCountry ?? "ES"}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="email" error={fe.email}>
            <Input id="email" name="email" type="email" defaultValue={v?.email ?? defaults?.email ?? ""} />
          </Field>
          <Field label="Teléfono" htmlFor="phone" error={fe.phone}>
            <Input id="phone" name="phone" type="tel" defaultValue={v?.phone ?? defaults?.phone ?? ""} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <Field label="IBAN" htmlFor="iban" error={fe.iban} hint="Para identificar sus pagos o cobros en el banco.">
            <Input
              id="iban"
              name="iban"
              className="num uppercase"
              defaultValue={v?.iban ?? (defaults?.iban ? formatIban(defaults.iban) : "")}
            />
          </Field>
          <Field
            label="Plazo (días)"
            htmlFor="paymentTermsDays"
            error={fe.paymentTermsDays}
            hint="Cobro o pago habitual."
          >
            <Input
              id="paymentTermsDays"
              name="paymentTermsDays"
              type="number"
              min={0}
              max={365}
              className="num"
              defaultValue={v?.paymentTermsDays ?? defaults?.paymentTermsDays ?? 30}
            />
          </Field>
        </div>
        {isSupplier && (
          <Field
            label="Categoría de gasto habitual"
            htmlFor="defaultExpenseCategoryId"
            error={fe.defaultExpenseCategoryId}
            hint="Se propondrá al registrar sus facturas y pagos."
          >
            <Select
              id="defaultExpenseCategoryId"
              name="defaultExpenseCategoryId"
              defaultValue={v?.defaultExpenseCategoryId ?? defaults?.defaultExpenseCategoryId ?? ""}
            >
              <option value="">Sin categoría por defecto</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {isCustomer && (
          <Field
            label="Categoría de ingreso habitual"
            htmlFor="defaultIncomeCategoryId"
            error={fe.defaultIncomeCategoryId}
          >
            <Select
              id="defaultIncomeCategoryId"
              name="defaultIncomeCategoryId"
              defaultValue={v?.defaultIncomeCategoryId ?? defaults?.defaultIncomeCategoryId ?? ""}
            >
              <option value="">Sin categoría por defecto</option>
              {incomeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Notas" htmlFor="notes" error={fe.notes}>
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
