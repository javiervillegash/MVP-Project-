import Link from "next/link";
import { notFound } from "next/navigation";
import { Tabs } from "@/components/tabs";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { isUuid } from "@/lib/ids";
import { LEGAL_FORM_LABELS } from "@/modules/access/labels";
import { requireAccess } from "@/modules/identity/session";
import { getLegalEntity } from "@/modules/tenancy/service";

/** Espacio de trabajo de una sociedad: cabecera común y pestañas. */
export default async function EntityLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { access } = await requireAccess();
  // RLS: si el usuario no tiene acceso a esta sociedad, simplemente no existe.
  const entity = await getLegalEntity(access, id);
  if (!entity) notFound();
  const base = `/sociedades/${id}`;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={entity.legalName}
        subtitle={
          <span className="num">
            {entity.taxId} · {LEGAL_FORM_LABELS[entity.legalForm]}
            {entity.status === "archived" && (
              <span className="ml-2">
                <Badge tone="muted">Archivada</Badge>
              </span>
            )}
          </span>
        }
        back={
          access.isOrgAdmin ? (
            <Link href={`/clientes/${entity.companyId}`}>← Cliente</Link>
          ) : (
            <Link href="/">← Inicio</Link>
          )
        }
      />
      <Tabs
        items={[
          { href: base, label: "Datos", exact: true },
          { href: `${base}/terceros`, label: "Clientes y proveedores" },
          { href: `${base}/categorias`, label: "Categorías" },
        ]}
      />
      {children}
    </div>
  );
}
