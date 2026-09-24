import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttachForm } from "@/components/documents/attach-form";
import { DocumentList } from "@/components/documents/document-list";
import { EntryForm } from "@/components/forms/entry-form";
import { Badge, Button } from "@/components/ui/primitives";
import { todayIso } from "@/lib/dates";
import { isUuid } from "@/lib/ids";
import { can } from "@/modules/access/context";
import { listDocumentsFor } from "@/modules/documents/service";
import { getEntry } from "@/modules/invoicing/entries";
import { requireAccess } from "@/modules/identity/session";
import { attachDocumentAction, setEntryStatusAction, updateEntryAction } from "../../facturas/actions";
import { entryFormOptions } from "../entry-options";

export const metadata: Metadata = { title: "Apunte" };

export default async function EntryPage({ params }: { params: Promise<{ id: string; eid: string }> }) {
  const { id, eid } = await params;
  if (!isUuid(eid)) notFound();
  const { access } = await requireAccess();
  if (!can(access, "invoice.view", id)) notFound();
  const entry = await getEntry(access, id, eid);
  if (!entry) notFound();
  const [{ categories, parties }, docs] = await Promise.all([
    entryFormOptions(access, id),
    can(access, "document.view", id)
      ? listDocumentsFor(access, id, { type: "manual_entry", id: eid })
      : Promise.resolve([]),
  ]);
  const canWrite = can(access, "invoice.write", id);
  const voided = entry.status === "void";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/sociedades/${id}/apuntes`} className="text-sm text-muted">
          ← Gastos e ingresos
        </Link>
        {canWrite && (
          <form action={setEntryStatusAction.bind(null, id, eid, voided ? "active" : "void")}>
            <Button type="submit" variant="secondary">
              {voided ? "Reactivar" : "Anular"}
            </Button>
          </form>
        )}
      </div>
      <h2 className="text-lg font-semibold">
        {entry.description} {voided && <Badge tone="muted">Anulado</Badge>}
      </h2>
      <EntryForm
        action={updateEntryAction.bind(null, id, eid)}
        categories={categories}
        parties={parties}
        today={todayIso()}
        defaults={entry}
        allowAttachment={false}
        submitLabel="Guardar cambios"
        readOnly={!canWrite || voided}
      />
      <section>
        <h3 className="mb-2 text-sm font-semibold">Justificantes</h3>
        <DocumentList docs={docs} />
        {can(access, "document.upload", id) && !voided && (
          <div className="mt-3">
            <AttachForm action={attachDocumentAction.bind(null, id, { type: "manual_entry", id: eid })} />
          </div>
        )}
      </section>
    </div>
  );
}
