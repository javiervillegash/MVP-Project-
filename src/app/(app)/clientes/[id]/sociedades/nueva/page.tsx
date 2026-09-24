import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityForm } from "@/components/forms/entity-form";
import { PageHeader } from "@/components/ui/primitives";
import { can } from "@/modules/access/context";
import { requireAccess } from "@/modules/identity/session";
import { getCompany } from "@/modules/tenancy/service";
import { createEntityAction } from "../../../actions";

export const metadata: Metadata = { title: "Nueva sociedad" };

export default async function NewEntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await requireAccess();
  if (!can(access, "entity.create")) notFound();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const company = await getCompany(access, id);
  if (!company) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Nueva sociedad"
        subtitle={`Cliente: ${company.name}`}
        back={<Link href={`/clientes/${id}`}>← {company.name}</Link>}
      />
      <EntityForm action={createEntityAction.bind(null, id)} submitLabel="Crear sociedad" />
    </div>
  );
}
