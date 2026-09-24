import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaperclipIcon } from "@/components/invoices/status-badge";
import { Badge, buttonClass, Input, Select, Table, Td, Th } from "@/components/ui/primitives";
import { formatDate, monthRange } from "@/lib/dates";
import { formatEuros, type Cents } from "@/lib/money";
import { can } from "@/modules/access/context";
import { listEntries, PAYMENT_METHOD_LABELS } from "@/modules/invoicing/entries";
import { requireAccess } from "@/modules/identity/session";

export const metadata: Metadata = { title: "Gastos e ingresos sin factura" };

export default async function EntriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string; mes?: string; q?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { access } = await requireAccess();
  if (!can(access, "invoice.view", id)) notFound();
  const kind = sp.tipo === "ingresos" ? "income" : sp.tipo === "gastos" ? "expense" : undefined;
  const month = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : "";
  const range = month ? monthRange(`${month}-01`) : undefined;
  const rows = await listEntries(access, id, { kind, from: range?.from, to: range?.to, q: sp.q });
  const base = `/sociedades/${id}/apuntes`;
  const totalExp = rows.filter((r) => r.kind === "expense").reduce((a, r) => a + r.amountCents, 0);
  const totalInc = rows.filter((r) => r.kind === "income").reduce((a, r) => a + r.amountCents, 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <form action={base} className="flex flex-wrap items-end gap-2">
          <div className="w-36">
            <Select name="tipo" defaultValue={sp.tipo ?? ""} aria-label="Tipo">
              <option value="">Todos</option>
              <option value="gastos">Gastos</option>
              <option value="ingresos">Ingresos</option>
            </Select>
          </div>
          <div className="w-44">
            <Input type="month" name="mes" defaultValue={month} aria-label="Mes" />
          </div>
          <div className="w-52">
            <Input name="q" defaultValue={sp.q} placeholder="Buscar descripción" aria-label="Buscar" />
          </div>
          <button type="submit" className={buttonClass("secondary")}>
            Filtrar
          </button>
        </form>
        {can(access, "invoice.write", id) && (
          <Link href={`${base}/nuevo`} className={buttonClass()}>
            Nuevo apunte
          </Link>
        )}
      </div>
      <p className="mb-4 text-sm text-muted">
        Comisiones bancarias, tickets, seguros sociales, intereses… todo lo que no tiene una factura completa.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No hay apuntes con estos filtros.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Descripción</Th>
              <Th>Categoría</Th>
              <Th>Pago</Th>
              <Th className="text-right">Importe</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="num whitespace-nowrap">{formatDate(r.entryDate)}</Td>
                <Td>
                  <Link href={`${base}/${r.id}`} className="font-medium hover:underline">
                    {r.description}
                  </Link>
                  {r.documents > 0 && <PaperclipIcon />}
                  {r.counterpartyName && <div className="text-xs text-muted">{r.counterpartyName}</div>}
                </Td>
                <Td className="text-muted">{r.categoryName}</Td>
                <Td className="text-muted">{PAYMENT_METHOD_LABELS[r.paymentMethod]}</Td>
                <Td className="num text-right font-medium">
                  {r.kind === "income" ? (
                    <Badge tone="accent">+{formatEuros(r.amountCents as Cents)}</Badge>
                  ) : (
                    `−${formatEuros(r.amountCents as Cents)}`
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-medium">
              <Td className="text-muted">{rows.length} apuntes</Td>
              <Td />
              <Td />
              <Td />
              <Td className="num text-right">
                {totalInc > 0 && <div>Ingresos {formatEuros(totalInc as Cents)}</div>}
                {totalExp > 0 && <div>Gastos {formatEuros(totalExp as Cents)}</div>}
              </Td>
            </tr>
          </tfoot>
        </Table>
      )}
    </>
  );
}
