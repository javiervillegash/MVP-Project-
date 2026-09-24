import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceForm } from "@/components/forms/invoice-form";
import { todayIso } from "@/lib/dates";
import { can } from "@/modules/access/context";
import { suggestNextNumber } from "@/modules/invoicing/invoices";
import { requireAccess } from "@/modules/identity/session";
import { createInvoiceAction } from "../actions";
import { invoiceFormOptions } from "../form-options";

export const metadata: Metadata = { title: "Registrar factura" };

export default async function NewInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { id } = await params;
  const { tipo } = await searchParams;
  const { access } = await requireAccess();
  if (!can(access, "invoice.write", id)) notFound();
  const direction = tipo === "recibida" ? "received" : "issued";
  const [{ parties, categories }, suggested] = await Promise.all([
    invoiceFormOptions(access, id, direction),
    direction === "issued" ? suggestNextNumber(access, id, "F") : Promise.resolve(null),
  ]);

  return (
    <>
      <div className="mb-4 text-sm text-muted">
        <Link href={`/sociedades/${id}/facturas?tipo=${direction === "received" ? "recibidas" : "emitidas"}`}>
          ← Facturas
        </Link>
      </div>
      <h2 className="mb-1 text-lg font-semibold">
        {direction === "received" ? "Registrar factura recibida" : "Registrar factura emitida"}
      </h2>
      <p className="mb-5 text-sm text-muted">
        {direction === "received"
          ? "Copia los datos de la factura del proveedor y adjunta el PDF."
          : "Registra una factura ya emitida con vuestro programa de facturación."}
      </p>
      <InvoiceForm
        direction={direction}
        action={createInvoiceAction.bind(null, id)}
        parties={parties}
        categories={categories}
        today={todayIso()}
        suggestedNumber={suggested}
        newPartyHref={`/sociedades/${id}/terceros/nuevo${direction === "issued" ? "?tipo=cliente" : ""}`}
        allowAttachment
        submitLabel="Guardar factura"
      />
    </>
  );
}
