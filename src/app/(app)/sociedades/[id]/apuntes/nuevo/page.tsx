import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntryForm } from "@/components/forms/entry-form";
import { todayIso } from "@/lib/dates";
import { can } from "@/modules/access/context";
import { requireAccess } from "@/modules/identity/session";
import { createEntryAction } from "../../facturas/actions";
import { entryFormOptions } from "../entry-options";

export const metadata: Metadata = { title: "Nuevo apunte" };

export default async function NewEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await requireAccess();
  if (!can(access, "invoice.write", id)) notFound();
  const { categories, parties } = await entryFormOptions(access, id);
  return (
    <>
      <div className="mb-4 text-sm text-muted">
        <Link href={`/sociedades/${id}/apuntes`}>← Gastos e ingresos</Link>
      </div>
      <h2 className="mb-4 text-lg font-semibold">Nuevo gasto o ingreso sin factura</h2>
      <EntryForm
        action={createEntryAction.bind(null, id)}
        categories={categories}
        parties={parties}
        today={todayIso()}
        allowAttachment
        submitLabel="Guardar"
      />
    </>
  );
}
