import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyForm } from "@/components/forms/company-form";
import { Badge, Button, buttonClass, Card, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { can } from "@/modules/access/context";
import { LEGAL_FORM_LABELS, describeGrant } from "@/modules/access/labels";
import { listMembers } from "@/modules/identity/members";
import { requireAccess } from "@/modules/identity/session";
import { getCompany, listStaff } from "@/modules/tenancy/service";
import { setCompanyStatusAction, setEntityStatusAction, updateCompanyAction } from "../actions";

export const metadata: Metadata = { title: "Cliente" };

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await requireAccess();
  if (!can(access, "company.create")) notFound();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const company = await getCompany(access, id);
  if (!company) notFound();
  const [staff, members] = await Promise.all([listStaff(access), listMembers(access)]);
  const entityIds = new Set(company.entities.map((e) => e.id));
  const withAccess = members
    .map((m) => ({
      ...m,
      grants: m.grants.filter((g) => g.companyId === id || (g.legalEntityId && entityIds.has(g.legalEntityId))),
    }))
    .filter((m) => m.grants.length > 0);
  const archived = company.status === "archived";

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <PageHeader
        title={company.name}
        subtitle={archived ? <Badge tone="muted">Archivado</Badge> : undefined}
        back={<Link href="/clientes">← Clientes</Link>}
        actions={
          <form action={setCompanyStatusAction.bind(null, id, archived ? "active" : "archived")}>
            <Button variant="secondary" type="submit">
              {archived ? "Reactivar cliente" : "Archivar cliente"}
            </Button>
          </form>
        }
      />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Sociedades</h2>
          {!archived && (
            <Link href={`/clientes/${id}/sociedades/nueva`} className={buttonClass("secondary")}>
              Añadir sociedad
            </Link>
          )}
        </div>
        {company.entities.length === 0 ? (
          <p className="text-sm text-muted">Este cliente aún no tiene sociedades.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Sociedad</Th>
                <Th>NIF</Th>
                <Th>Forma</Th>
                <Th>IVA</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {company.entities.map((e) => (
                <tr key={e.id} className={e.status === "archived" ? "text-muted" : undefined}>
                  <Td>
                    <Link href={`/sociedades/${e.id}`} className="font-medium hover:underline">
                      {e.legalName}
                    </Link>
                    {e.status === "archived" && (
                      <span className="ml-2">
                        <Badge tone="muted">Archivada</Badge>
                      </span>
                    )}
                  </Td>
                  <Td className="num">{e.taxId}</Td>
                  <Td>{LEGAL_FORM_LABELS[e.legalForm]}</Td>
                  <Td>{e.vatFilingFrequency === "mensual" ? "Mensual" : "Trimestral"}</Td>
                  <Td className="text-right">
                    {!archived && (
                      <form
                        action={setEntityStatusAction.bind(
                          null,
                          e.id,
                          id,
                          e.status === "active" ? "archived" : "active",
                        )}
                      >
                        <button type="submit" className="text-sm text-muted underline hover:text-text">
                          {e.status === "active" ? "Archivar" : "Reactivar"}
                        </button>
                      </form>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Personas con acceso</h2>
          <Link href={`/usuarios/nuevo?cliente=${id}`} className={buttonClass("secondary")}>
            Invitar a alguien
          </Link>
        </div>
        {withAccess.length === 0 ? (
          <p className="text-sm text-muted">
            Nadie tiene acceso específico a este cliente todavía (los Administradores lo ven todo).
          </p>
        ) : (
          <Card className="divide-y divide-border">
            {withAccess.map((m) => (
              <div key={m.userId} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
                <Link href={`/usuarios/${m.userId}`} className="font-medium hover:underline">
                  {m.name}
                </Link>
                <span className="text-muted">{m.grants.map(describeGrant).join(" · ")}</span>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Datos del cliente</h2>
        <CompanyForm
          action={updateCompanyAction.bind(null, id)}
          staff={staff}
          defaults={company}
          submitLabel="Guardar cambios"
        />
      </section>
    </div>
  );
}
