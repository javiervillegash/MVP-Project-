import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceStatusBadge, PaperclipIcon } from "@/components/invoices/status-badge";
import { buttonClass, Input, Select, Table, Td, Th } from "@/components/ui/primitives";
import { formatDate, monthRange } from "@/lib/dates";
import { formatEuros, type Cents } from "@/lib/money";
import { can } from "@/modules/access/context";
import { INVOICE_LIST_LIMIT, listInvoices } from "@/modules/invoicing/invoices";
import { requireAccess } from "@/modules/identity/session";

export const metadata: Metadata = { title: "Facturas" };

const STATES = [
  { key: "all", label: "Todas" },
  { key: "pending", label: "Pendientes" },
  { key: "overdue", label: "Vencidas" },
  { key: "void", label: "Anuladas" },
] as const;

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string; estado?: string; mes?: string; q?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { access } = await requireAccess();
  if (!can(access, "invoice.view", id)) notFound();
  const direction = sp.tipo === "recibidas" ? "received" : "issued";
  const state = (STATES.find((s) => s.key === sp.estado)?.key ?? "all") as (typeof STATES)[number]["key"];
  const month = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : "";
  const range = month ? monthRange(`${month}-01`) : undefined;
  const rows = await listInvoices(access, id, { direction, state, from: range?.from, to: range?.to, q: sp.q });
  const base = `/sociedades/${id}/facturas`;
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({
      tipo: direction === "received" ? "recibidas" : "emitidas",
      ...(sp.estado && { estado: sp.estado }),
      ...(month && { mes: month }),
      ...(sp.q && { q: sp.q }),
      ...over,
    });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `${base}?${p}`;
  };
  const hasWithholding = rows.some((r) => r.withholdingCents !== 0);
  const sum = (k: "baseCents" | "vatCents" | "withholdingCents" | "totalCents") =>
    rows.filter((r) => r.derived !== "void").reduce((a, r) => a + r[k], 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {(["emitidas", "recibidas"] as const).map((t) => (
            <Link
              key={t}
              href={qs({ tipo: t, estado: "" })}
              className={
                "rounded-md px-3 py-1.5 text-sm capitalize " +
                ((t === "recibidas") === (direction === "received")
                  ? "bg-surface-muted font-medium"
                  : "text-muted hover:text-text")
              }
            >
              {t}
            </Link>
          ))}
        </div>
        {can(access, "invoice.write", id) && (
          <Link
            href={`${base}/nueva?tipo=${direction === "received" ? "recibida" : "emitida"}`}
            className={buttonClass()}
          >
            {direction === "received" ? "Registrar factura recibida" : "Registrar factura emitida"}
          </Link>
        )}
      </div>

      <form action={base} className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="tipo" value={direction === "received" ? "recibidas" : "emitidas"} />
        <div className="w-40">
          <Select name="estado" defaultValue={state} aria-label="Estado">
            {STATES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Input type="month" name="mes" defaultValue={month} aria-label="Mes" />
        </div>
        <div className="w-56">
          <Input name="q" defaultValue={sp.q} placeholder="Número o nombre" aria-label="Buscar" />
        </div>
        <button type="submit" className={buttonClass("secondary")}>
          Filtrar
        </button>
        {(sp.estado || month || sp.q) && (
          <Link href={qs({ estado: "", mes: "", q: "" })} className="px-2 text-sm text-muted underline">
            Quitar filtros
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          No hay facturas {direction === "received" ? "recibidas" : "emitidas"} con estos filtros.
        </p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Número</Th>
              <Th>{direction === "received" ? "Proveedor" : "Cliente"}</Th>
              <Th className="text-right">Base</Th>
              <Th className="text-right">IVA</Th>
              {hasWithholding && <Th className="text-right">Retención</Th>}
              <Th className="text-right">Total</Th>
              <Th>Vence</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.derived === "void" ? "text-muted line-through" : undefined}>
                <Td className="num whitespace-nowrap">{formatDate(r.issueDate)}</Td>
                <Td className="whitespace-nowrap">
                  <Link href={`${base}/${r.id}`} className="font-medium hover:underline">
                    {r.series ? `${r.series}-` : ""}
                    {r.number}
                  </Link>
                  {r.documents > 0 && <PaperclipIcon />}
                  {r.isCorrective && <span className="ml-1 text-xs text-muted">(rect.)</span>}
                </Td>
                <Td className="min-w-40">{r.counterpartyName}</Td>
                <Td className="num text-right">{formatEuros(r.baseCents as Cents)}</Td>
                <Td className="num text-right">{formatEuros((r.vatCents + r.surchargeCents) as Cents)}</Td>
                {hasWithholding && (
                  <Td className="num text-right">
                    {r.withholdingCents ? formatEuros(r.withholdingCents as Cents) : ""}
                  </Td>
                )}
                <Td className="num text-right font-medium">
                  {formatEuros(r.totalCents as Cents)}
                  {r.declaredTotalCents !== null && r.declaredTotalCents !== r.totalCents && (
                    <span className="ml-1 text-xs text-warning" title="No cuadra con el total del documento">
                      (no cuadra)
                    </span>
                  )}
                </Td>
                <Td className="num whitespace-nowrap">{formatDate(r.dueDate)}</Td>
                <Td>
                  <InvoiceStatusBadge status={r.derived} />
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-medium">
              <Td className="text-muted" />
              <Td className="text-muted">{rows.length} facturas</Td>
              <Td />
              <Td className="num text-right">{formatEuros(sum("baseCents") as Cents)}</Td>
              <Td className="num text-right">{formatEuros(sum("vatCents") as Cents)}</Td>
              {hasWithholding && <Td className="num text-right">{formatEuros(sum("withholdingCents") as Cents)}</Td>}
              <Td className="num text-right">{formatEuros(sum("totalCents") as Cents)}</Td>
              <Td />
              <Td />
            </tr>
          </tfoot>
        </Table>
      )}
      {rows.length === INVOICE_LIST_LIMIT && (
        <p className="mt-2 text-xs text-muted">Se muestran las {INVOICE_LIST_LIMIT} más recientes; filtra por mes.</p>
      )}
    </>
  );
}
