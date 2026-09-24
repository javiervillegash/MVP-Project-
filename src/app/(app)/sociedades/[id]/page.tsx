import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityForm } from "@/components/forms/entity-form";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { can } from "@/modules/access/context";
import { requireAccess } from "@/modules/identity/session";
import { getLegalEntity } from "@/modules/tenancy/service";
import { updateEntityAction } from "../../clientes/actions";

export const metadata: Metadata = { title: "Sociedad" };

export default async function EntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await requireAccess();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  // RLS: si el usuario no tiene acceso a esta sociedad, simplemente no existe.
  const entity = await getLegalEntity(access, id);
  if (!entity) notFound();
  const canEdit = can(access, "entity.settings", id) && entity.status === "active";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={entity.legalName}
        subtitle={entity.status === "archived" ? <Badge tone="muted">Archivada</Badge> : entity.taxId}
        back={
          access.isOrgAdmin ? (
            <Link href={`/clientes/${entity.companyId}`}>← Cliente</Link>
          ) : (
            <Link href="/">← Inicio</Link>
          )
        }
      />
      <h2 className="mb-3 text-lg font-semibold">Datos fiscales</h2>
      <EntityForm
        action={updateEntityAction.bind(null, id)}
        defaults={entity}
        submitLabel="Guardar cambios"
        readOnly={!canEdit}
      />
    </div>
  );
}
