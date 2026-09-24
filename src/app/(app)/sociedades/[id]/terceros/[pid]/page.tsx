import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CounterpartyForm } from "@/components/forms/counterparty-form";
import { Badge, Button } from "@/components/ui/primitives";
import { isUuid } from "@/lib/ids";
import { can } from "@/modules/access/context";
import { flattenCategories, listCategories } from "@/modules/accounting/categories";
import { getCounterparty } from "@/modules/accounting/counterparties";
import { requireAccess } from "@/modules/identity/session";
import { setCounterpartyStatusAction, updateCounterpartyAction } from "../../actions";

export const metadata: Metadata = { title: "Cliente o proveedor" };

export default async function CounterpartyPage({ params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params;
  if (!isUuid(pid)) notFound();
  const { access } = await requireAccess();
  const [party, tree] = await Promise.all([
    getCounterparty(access, id, pid),
    listCategories(access, id, { includeArchived: true }),
  ]);
  if (!party) notFound();
  const canEdit = can(access, "party.write", id);
  const archived = party.status === "archived";

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href={`/sociedades/${id}/terceros`} className="text-sm text-muted">
          ← Clientes y proveedores
        </Link>
        {canEdit && (
          <form action={setCounterpartyStatusAction.bind(null, id, pid, archived ? "active" : "archived")}>
            <Button type="submit" variant="secondary">
              {archived ? "Reactivar" : "Archivar"}
            </Button>
          </form>
        )}
      </div>
      <h2 className="mb-3 text-lg font-semibold">
        {party.name}
        {archived && (
          <span className="ml-2 align-middle">
            <Badge tone="muted">Archivado</Badge>
          </span>
        )}
      </h2>
      <CounterpartyForm
        action={updateCounterpartyAction.bind(null, id, pid)}
        incomeCategories={flattenCategories(tree, "income")}
        expenseCategories={flattenCategories(tree, "expense")}
        defaults={party}
        submitLabel="Guardar cambios"
        readOnly={!canEdit || archived}
      />
    </>
  );
}
