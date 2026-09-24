import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntityForm } from "@/components/forms/entity-form";
import { can } from "@/modules/access/context";
import { requireAccess } from "@/modules/identity/session";
import { getLegalEntity } from "@/modules/tenancy/service";
import { updateEntityAction } from "../../clientes/actions";

export const metadata: Metadata = { title: "Sociedad" };

export default async function EntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await requireAccess();
  const entity = await getLegalEntity(access, id);
  if (!entity) notFound();
  const canEdit = can(access, "entity.settings", id) && entity.status === "active";

  return (
    <>
      <h2 className="mb-3 text-lg font-semibold">Datos fiscales</h2>
      <EntityForm
        action={updateEntityAction.bind(null, id)}
        defaults={entity}
        submitLabel="Guardar cambios"
        readOnly={!canEdit}
      />
    </>
  );
}
