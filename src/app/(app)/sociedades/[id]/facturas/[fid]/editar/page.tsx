import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceForm } from "@/components/forms/invoice-form";
import { todayIso } from "@/lib/dates";
import { isUuid } from "@/lib/ids";
import { can } from "@/modules/access/context";
import { getInvoice } from "@/modules/invoicing/invoices";
import { requireAccess } from "@/modules/identity/session";
import { updateInvoiceAction } from "../../actions";
import { invoiceFormOptions } from "../../form-options";

export const metadata: Metadata = { title: "Editar factura" };

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string; fid: string }> }) {
  const { id, fid } = await params;
  if (!isUuid(fid)) notFound();
  const { access } = await requireAccess();
  if (!can(access, "invoice.write", id)) notFound();
  const inv = await getInvoice(access, id, fid);
  if (!inv || inv.status === "void") notFound();
  const { parties, categories } = await invoiceFormOptions(access, id, inv.direction);
  // Si el tercero se archivó, sigue apareciendo en su propia factura.
  if (!parties.some((p) => p.id === inv.counterpartyId)) {
    parties.unshift({
      id: inv.counterpartyId,
      name: inv.counterpartyName,
      paymentTermsDays: 0,
      defaultCategoryId: null,
    });
  }

  return (
    <>
      <div className="mb-4 text-sm text-muted">
        <Link href={`/sociedades/${id}/facturas/${fid}`}>← Volver a la factura</Link>
      </div>
      <h2 className="mb-5 text-lg font-semibold">Editar factura {inv.number}</h2>
      <InvoiceForm
        direction={inv.direction}
        action={updateInvoiceAction.bind(null, id, fid)}
        parties={parties}
        categories={categories}
        today={todayIso()}
        defaults={inv}
        newPartyHref={`/sociedades/${id}/terceros/nuevo`}
        allowAttachment={false}
        submitLabel="Guardar cambios"
      />
    </>
  );
}
