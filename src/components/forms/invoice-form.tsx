"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Alert, Button, Card, Checkbox, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import type { FormState } from "@/lib/action-state";
import { formatEuros, parseEuros, type Cents } from "@/lib/money";
import {
  addDays,
  computeTotals,
  formatQuantity,
  formatRate,
  parseQuantity,
  SURCHARGE_RATES,
  VAT_RATES,
  WITHHOLDING_RATES,
} from "@/modules/invoicing/calc";

type Direction = "issued" | "received";

export interface PartyOption {
  id: string;
  name: string;
  paymentTermsDays: number;
  defaultCategoryId: string | null;
}

interface LineState {
  key: number;
  description: string;
  quantity: string;
  price: string;
  vatRateBp: number;
  surchargeRateBp: number;
  withholdingRateBp: number;
  categoryId: string;
}

export interface InvoiceDefaults {
  counterpartyId: string;
  series: string | null;
  number: string;
  issueDate: string;
  dueDate: string;
  description: string | null;
  isCorrective: boolean;
  declaredTotalCents: number | null;
  notes: string | null;
  lines: {
    description: string;
    quantityMilli: number;
    unitPriceCents: number;
    vatRateBp: number;
    surchargeRateBp: number;
    withholdingRateBp: number;
    categoryId: string | null;
  }[];
}

interface Props {
  direction: Direction;
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  parties: PartyOption[];
  categories: { id: string; label: string }[];
  today: string;
  suggestedNumber?: string | null;
  defaults?: InvoiceDefaults;
  newPartyHref: string;
  allowAttachment: boolean;
  submitLabel: string;
}

let nextKey = 1;
const euros = (c: number) => formatEuros(c as Cents).replace(/\s?€/, "");

function toLineState(l: InvoiceDefaults["lines"][number]): LineState {
  return {
    key: nextKey++,
    description: l.description,
    quantity: formatQuantity(l.quantityMilli),
    price: euros(l.unitPriceCents),
    vatRateBp: l.vatRateBp,
    surchargeRateBp: l.surchargeRateBp,
    withholdingRateBp: l.withholdingRateBp,
    categoryId: l.categoryId ?? "",
  };
}

function emptyLine(categoryId = "", previous?: LineState): LineState {
  return {
    key: nextKey++,
    description: "",
    quantity: "1",
    price: "",
    vatRateBp: previous?.vatRateBp ?? 2100,
    surchargeRateBp: previous?.surchargeRateBp ?? 0,
    withholdingRateBp: previous?.withholdingRateBp ?? 0,
    categoryId: previous?.categoryId || categoryId,
  };
}

/** Convierte una línea del formulario a céntimos/milésimas, o marca el error. */
function parseLine(l: LineState) {
  const quantityMilli = parseQuantity(l.quantity);
  let unitPriceCents: number | null = null;
  try {
    unitPriceCents = l.price.trim() ? parseEuros(l.price) : null;
  } catch {
    unitPriceCents = null;
  }
  return { quantityMilli, unitPriceCents };
}

export function InvoiceForm(props: Props) {
  const { direction, parties, categories, defaults } = props;
  const [state, formAction, pending] = useActionState(props.action, {});

  const [counterpartyId, setCounterpartyId] = useState(defaults?.counterpartyId ?? "");
  const [series, setSeries] = useState(defaults?.series ?? "");
  const [number, setNumber] = useState(defaults?.number ?? props.suggestedNumber ?? "");
  const [issueDate, setIssueDate] = useState(defaults?.issueDate ?? props.today);
  const [dueDate, setDueDate] = useState(defaults?.dueDate ?? props.today);
  const [dueTouched, setDueTouched] = useState(!!defaults);
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [isCorrective, setIsCorrective] = useState(defaults?.isCorrective ?? false);
  const [declaredTotal, setDeclaredTotal] = useState(
    defaults?.declaredTotalCents != null ? euros(defaults.declaredTotalCents) : "",
  );
  const [notes, setNotes] = useState(defaults?.notes ?? "");
  const [lines, setLines] = useState<LineState[]>(() =>
    defaults?.lines.length ? defaults.lines.map(toLineState) : [emptyLine()],
  );

  const party = parties.find((p) => p.id === counterpartyId);

  function onParty(id: string) {
    setCounterpartyId(id);
    const p = parties.find((x) => x.id === id);
    if (!p) return;
    if (!dueTouched) setDueDate(addDays(issueDate, p.paymentTermsDays));
    // Categoría habitual del tercero en las líneas que aún no tienen.
    if (p.defaultCategoryId) {
      setLines((ls) => ls.map((l) => (l.categoryId ? l : { ...l, categoryId: p.defaultCategoryId! })));
    }
  }

  function onIssueDate(d: string) {
    setIssueDate(d);
    if (!dueTouched && d) setDueDate(addDays(d, party?.paymentTermsDays ?? 0));
  }

  const updateLine = (key: number, patch: Partial<LineState>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const parsed = lines.map(parseLine);
  const valid = parsed.every((p) => p.quantityMilli && p.unitPriceCents !== null);
  const totals = useMemo(
    () =>
      computeTotals(
        lines.map((l, i) => ({
          quantityMilli: parsed[i].quantityMilli ?? 0,
          unitPriceCents: parsed[i].unitPriceCents ?? 0,
          vatRateBp: l.vatRateBp,
          surchargeRateBp: l.surchargeRateBp,
          withholdingRateBp: l.withholdingRateBp,
        })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(lines)],
  );

  let declaredCents: number | null = null;
  let declaredError = false;
  if (declaredTotal.trim()) {
    try {
      declaredCents = parseEuros(declaredTotal);
    } catch {
      declaredError = true;
    }
  }
  const mismatch = declaredCents !== null && declaredCents !== totals.totalCents;
  const hasSurcharge = lines.some((l) => l.surchargeRateBp > 0);

  const payload = JSON.stringify({
    direction,
    counterpartyId,
    series: series || null,
    number,
    issueDate,
    dueDate,
    description: description || null,
    isCorrective,
    declaredTotalCents: declaredCents,
    notes: notes || null,
    lines: lines.map((l, i) => ({
      description: l.description,
      quantityMilli: parsed[i].quantityMilli,
      unitPriceCents: parsed[i].unitPriceCents,
      vatRateBp: l.vatRateBp,
      surchargeRateBp: l.surchargeRateBp,
      withholdingRateBp: l.withholdingRateBp,
      categoryId: l.categoryId,
    })),
  });

  const fe = state.fieldErrors ?? {};
  const partyLabel = direction === "issued" ? "Cliente" : "Proveedor";

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="payload" value={payload} />

      <div className="grid gap-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <Field label={partyLabel} htmlFor="counterpartyId" error={fe.counterpartyId}>
            <Select id="counterpartyId" value={counterpartyId} onChange={(e) => onParty(e.target.value)} required>
              <option value="">Elige…</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Link href={props.newPartyHref} className="mt-1 inline-block text-xs text-muted underline" target="_blank">
            ¿No está? Dar de alta un {partyLabel.toLowerCase()} (se abre en otra pestaña)
          </Link>
        </div>
        {direction === "issued" && (
          <Field label="Serie" htmlFor="series" error={fe.series}>
            <Input id="series" value={series} onChange={(e) => setSeries(e.target.value)} placeholder="F" />
          </Field>
        )}
        <Field
          label="Número"
          htmlFor="number"
          error={fe.number}
          hint={direction === "received" ? "El que figura en la factura del proveedor." : undefined}
        >
          <Input id="number" value={number} onChange={(e) => setNumber(e.target.value)} required />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Fecha de factura" htmlFor="issueDate" error={fe.issueDate}>
          <Input id="issueDate" type="date" value={issueDate} onChange={(e) => onIssueDate(e.target.value)} required />
        </Field>
        <Field
          label="Vencimiento"
          htmlFor="dueDate"
          error={fe.dueDate}
          hint={
            !dueTouched && party ? `A ${party.paymentTermsDays} días, según el ${partyLabel.toLowerCase()}` : undefined
          }
        >
          <Input
            id="dueDate"
            type="date"
            value={dueDate}
            min={issueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              setDueTouched(true);
            }}
            required
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Concepto general (opcional)" htmlFor="description" error={fe.description}>
            <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Líneas</h2>
        {fe.lines && <p className="mb-2 text-xs text-danger">{fe.lines}</p>}
        <div className="space-y-3">
          {lines.map((l, i) => {
            const p = parsed[i];
            return (
              <Card key={l.key} className="grid gap-3 p-3 md:grid-cols-12">
                <div className="md:col-span-5">
                  <Input
                    aria-label={`Descripción línea ${i + 1}`}
                    placeholder="Descripción"
                    value={l.description}
                    onChange={(e) => updateLine(l.key, { description: e.target.value })}
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <Input
                    aria-label={`Cantidad línea ${i + 1}`}
                    inputMode="decimal"
                    className={"num text-right " + (p.quantityMilli ? "" : "border-danger")}
                    value={l.quantity}
                    onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Input
                    aria-label={`Precio línea ${i + 1}`}
                    inputMode="decimal"
                    placeholder="Precio €"
                    className={"num text-right " + (l.price && p.unitPriceCents === null ? "border-danger" : "")}
                    value={l.price}
                    onChange={(e) => updateLine(l.key, { price: e.target.value })}
                    required
                  />
                </div>
                <div className="num flex items-center justify-end text-sm md:col-span-2">
                  {formatEuros(totals.lineBases[i] as Cents)}
                </div>
                <div className="flex items-center justify-end md:col-span-1">
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-muted underline hover:text-danger"
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    >
                      Quitar
                    </button>
                  )}
                </div>
                <div className="md:col-span-4">
                  <Select
                    aria-label={`Categoría línea ${i + 1}`}
                    value={l.categoryId}
                    onChange={(e) => updateLine(l.key, { categoryId: e.target.value })}
                    required
                  >
                    <option value="">Categoría…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="md:col-span-3">
                  <Select
                    aria-label={`IVA línea ${i + 1}`}
                    value={l.vatRateBp}
                    onChange={(e) => updateLine(l.key, { vatRateBp: Number(e.target.value) })}
                  >
                    {VAT_RATES.map((r) => (
                      <option key={r.bp} value={r.bp}>
                        IVA {r.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Select
                    aria-label={`Recargo línea ${i + 1}`}
                    value={l.surchargeRateBp}
                    onChange={(e) => updateLine(l.key, { surchargeRateBp: Number(e.target.value) })}
                  >
                    {SURCHARGE_RATES.map((r) => (
                      <option key={r.bp} value={r.bp}>
                        {r.bp ? `Recargo ${r.label}` : r.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="md:col-span-3">
                  <Select
                    aria-label={`Retención línea ${i + 1}`}
                    value={l.withholdingRateBp}
                    onChange={(e) => updateLine(l.key, { withholdingRateBp: Number(e.target.value) })}
                  >
                    {WITHHOLDING_RATES.map((r) => (
                      <option key={r.bp} value={r.bp}>
                        {r.bp ? `Retención ${r.label}` : r.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </Card>
            );
          })}
        </div>
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          onClick={() => setLines((ls) => [...ls, emptyLine(party?.defaultCategoryId ?? "", ls[ls.length - 1])])}
        >
          Añadir línea
        </Button>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <Checkbox
            label="Factura rectificativa (abono)"
            checked={isCorrective}
            onChange={(e) => setIsCorrective(e.target.checked)}
          />
          {direction === "received" && (
            <Field
              label="Total según la factura (opcional)"
              htmlFor="declaredTotal"
              error={declaredError ? "Importe no válido" : fe.declaredTotalCents}
              hint="Si lo indicas, avisamos cuando no cuadre con las líneas."
            >
              <Input
                id="declaredTotal"
                inputMode="decimal"
                className="num"
                value={declaredTotal}
                onChange={(e) => setDeclaredTotal(e.target.value)}
              />
            </Field>
          )}
          {props.allowAttachment && (
            <Field
              label="PDF o imagen de la factura (opcional)"
              htmlFor="attachment"
              error={fe.file}
              hint="Máximo 15 MB."
            >
              <Input id="attachment" name="attachment" type="file" accept="application/pdf,image/*,.xml" />
            </Field>
          )}
          <Field label="Notas internas" htmlFor="notes" error={fe.notes}>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        <Card className="h-fit p-4">
          <dl className="num space-y-1 text-sm">
            <Row label="Base imponible" value={totals.baseCents} />
            {totals.vatBreakdown.map((b) => (
              <Row key={`v${b.rateBp}`} label={`IVA ${formatRate(b.rateBp)}`} value={b.amountCents} muted />
            ))}
            {hasSurcharge &&
              totals.surchargeBreakdown.map((b) => (
                <Row key={`s${b.rateBp}`} label={`Recargo ${formatRate(b.rateBp)}`} value={b.amountCents} muted />
              ))}
            {totals.withholdingBreakdown.map((b) => (
              <Row key={`w${b.rateBp}`} label={`Retención ${formatRate(b.rateBp)}`} value={-b.amountCents} muted />
            ))}
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd>{formatEuros(totals.totalCents as Cents)}</dd>
            </div>
          </dl>
          {mismatch && (
            <p className="mt-3 text-xs text-warning">
              No cuadra con el total de la factura ({formatEuros(declaredCents as Cents)}): diferencia de{" "}
              {formatEuros((declaredCents! - totals.totalCents) as Cents)}. Revisa las líneas o guárdala igualmente para
              revisarla después.
            </p>
          )}
        </Card>
      </div>

      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="success">Cambios guardados.</Alert>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || !valid}>
          {pending ? "Guardando…" : props.submitLabel}
        </Button>
        {!valid && <span className="text-xs text-muted">Revisa las cantidades y precios marcados.</span>}
      </div>
    </form>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={"flex justify-between " + (muted ? "text-muted" : "")}>
      <dt>{label}</dt>
      <dd>{formatEuros(value as Cents)}</dd>
    </div>
  );
}
