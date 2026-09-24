import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttachForm } from "@/components/documents/attach-form";
import { DocumentList } from "@/components/documents/document-list";
import { InvoiceStatusBadge } from "@/components/invoices/status-badge";
import { StatusForm } from "@/components/invoices/status-form";
import { buttonClass, Card, Table, Td, Th } from "@/components/ui/primitives";
import { formatDate } from "@/lib/dates";
import { isUuid } from "@/lib/ids";
import { formatEuros, type Cents } from "@/lib/money";
import { can } from "@/modules/access/context";
import { flattenCategories, listCategories } from "@/modules/accounting/categories";
import { listDocumentsFor } from "@/modules/documents/service";
import { formatQuantity, formatRate } from "@/modules/invoicing/calc";
import { getInvoice } from "@/modules/invoicing/invoices";
import { requireAccess } from "@/modules/identity/session";
import { attachDocumentAction, setInvoiceStatusAction, unlinkDocumentAction } from "../actions";

export const metadata: Metadata = { title: "Factura" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string; fid: string }> }) {
  const { id, fid } = await params;
  if (!isUuid(fid)) notFound();
  const { access } = await requireAccess();
  if (!can(access, "invoice.view", id)) notFound();
  const inv = await getInvoice(access, id, fid);
  if (!inv) notFound();
  const [docs, tree] = await Promise.all([
    can(access, "document.view", id) ? listDocumentsFor(access, id, { type: "invoice", id: fid }) : Promise.resolve([]),
    listCategories(access, id, { includeArchived: true }),
  ]);
  const catLabel = new Map(flattenCategories(tree).map((c) => [c.id, c.label]));
  const canWrite = can(access, "invoice.write", id);
  const issued = inv.direction === "issued";
  const t = inv.totals;
  const mismatch = inv.declaredTotalCents !== null && inv.declaredTotalCents !== inv.totalCents;
  const target = { type: "invoice" as const, id: fid };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/sociedades/${id}/facturas?tipo=${issued ? "emitidas" : "recibidas"}`}
            className="text-sm text-muted"
          >
            ← Facturas {issued ? "emitidas" : "recibidas"}
          </Link>
          <h2 className="mt-2 flex items-center gap-3 text-xl font-semibold">
            {inv.isCorrective ? "Rectificativa" : "Factura"} {inv.series ? `${inv.series}-` : ""}
            {inv.number}
            <InvoiceStatusBadge status={inv.derived} />
          </h2>
          <p className="mt-1 text-sm text-muted">
            {issued ? "Cliente" : "Proveedor"}: {inv.counterpartyName}
            {inv.counterpartyTaxId && <span className="num"> · {inv.counterpartyTaxId}</span>}
          </p>
          {inv.statusReason && <p className="mt-1 text-sm text-muted">Motivo: {inv.statusReason}</p>}
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-start gap-2">
            {inv.status !== "void" && (
              <Link href={`/sociedades/${id}/facturas/${fid}/editar`} className={buttonClass("secondary")}>
                Editar
              </Link>
            )}
            {inv.status === "active" && issued && (
              <StatusForm
                action={setInvoiceStatusAction.bind(null, id, fid, "uncollectible")}
                label="Marcar incobrable"
                needsReason
              />
            )}
            {inv.status === "active" && (
              <StatusForm
                action={setInvoiceStatusAction.bind(null, id, fid, "void")}
                label="Anular"
                needsReason
                danger
              />
            )}
            {inv.status !== "active" && (
              <StatusForm action={setInvoiceStatusAction.bind(null, id, fid, "active")} label="Reactivar" />
            )}
          </div>
        )}
      </div>

      <dl className="grid gap-4 text-sm sm:grid-cols-4">
        <Info label="Fecha" value={formatDate(inv.issueDate)} />
        <Info label="Vencimiento" value={formatDate(inv.dueDate)} />
        <Info label="Concepto" value={inv.description ?? "—"} />
        <Info label="Registrada" value={formatDate(inv.createdAt.toISOString().slice(0, 10))} />
      </dl>

      <Table>
        <thead>
          <tr>
            <Th>Descripción</Th>
            <Th>Categoría</Th>
            <Th className="text-right">Cantidad</Th>
            <Th className="text-right">Precio</Th>
            <Th className="text-right">IVA</Th>
            <Th className="text-right">Base</Th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l) => (
            <tr key={l.id}>
              <Td>{l.description}</Td>
              <Td className="text-muted">{l.categoryId ? catLabel.get(l.categoryId) : "—"}</Td>
              <Td className="num text-right">{formatQuantity(l.quantityMilli)}</Td>
              <Td className="num text-right">{formatEuros(l.unitPriceCents as Cents)}</Td>
              <Td className="num text-right">
                {formatRate(l.vatRateBp)}
                {l.surchargeRateBp > 0 && ` + RE ${formatRate(l.surchargeRateBp)}`}
                {l.withholdingRateBp > 0 && (
                  <span className="block text-xs text-muted">Ret. {formatRate(l.withholdingRateBp)}</span>
                )}
              </Td>
              <Td className="num text-right">{formatEuros(l.baseCents as Cents)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="mb-2 text-sm font-semibold">Documentos</h3>
          <DocumentList
            docs={docs}
            action={
              canWrite
                ? (d) => (
                    <form action={unlinkDocumentAction.bind(null, id, d.id, target)}>
                      <button type="submit" className="underline hover:text-danger">
                        Quitar
                      </button>
                    </form>
                  )
                : undefined
            }
          />
          {can(access, "document.upload", id) && (
            <div className="mt-3">
              <AttachForm action={attachDocumentAction.bind(null, id, target)} />
            </div>
          )}
        </section>
        <Card className="h-fit p-4">
          <dl className="num space-y-1 text-sm">
            <Row label="Base imponible" value={inv.baseCents} />
            {t.vatBreakdown.map((b) => (
              <Row
                key={`v${b.rateBp}`}
                label={`IVA ${formatRate(b.rateBp)} s/ ${formatEuros(b.baseCents as Cents)}`}
                value={b.amountCents}
                muted
              />
            ))}
            {t.surchargeBreakdown.map((b) => (
              <Row key={`s${b.rateBp}`} label={`Recargo ${formatRate(b.rateBp)}`} value={b.amountCents} muted />
            ))}
            {t.withholdingBreakdown.map((b) => (
              <Row key={`w${b.rateBp}`} label={`Retención ${formatRate(b.rateBp)}`} value={-b.amountCents} muted />
            ))}
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd>{formatEuros(inv.totalCents as Cents)}</dd>
            </div>
          </dl>
          {mismatch && (
            <p className="mt-3 text-xs text-warning">
              El documento indica {formatEuros(inv.declaredTotalCents as Cents)} (diferencia de{" "}
              {formatEuros((inv.declaredTotalCents! - inv.totalCents) as Cents)}). Revisa las líneas.
            </p>
          )}
        </Card>
      </div>

      {inv.notes && (
        <section>
          <h3 className="mb-1 text-sm font-semibold">Notas</h3>
          <p className="whitespace-pre-line text-sm text-muted">{inv.notes}</p>
        </section>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-0.5">{value}</dd>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={"flex justify-between gap-4 " + (muted ? "text-muted" : "")}>
      <dt>{label}</dt>
      <dd>{formatEuros(value as Cents)}</dd>
    </div>
  );
}
