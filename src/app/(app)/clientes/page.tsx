import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge, buttonClass, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { formatEuros, type Cents } from "@/lib/money";
import { can } from "@/modules/access/context";
import { PLANS } from "@/modules/access/entitlements";
import { PLAN_LABELS } from "@/modules/access/labels";
import { requireAccess } from "@/modules/identity/session";
import { listCompanies } from "@/modules/tenancy/service";

export const metadata: Metadata = { title: "Clientes" };

export default async function CompaniesPage() {
  const { access } = await requireAccess();
  if (!can(access, "company.create")) notFound();
  const rows = await listCompanies(access);
  const active = rows.filter((r) => r.status === "active");
  const mrr = active.reduce((sum, r) => sum + (r.customMonthlyPriceCents ?? PLANS[r.plan].basePriceCents ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Clientes"
        subtitle={`${active.length} activos · ${formatEuros(mrr as Cents)} al mes en paquetes`}
        actions={
          <Link href="/clientes/nuevo" className={buttonClass()}>
            Nuevo cliente
          </Link>
        }
      />
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay clientes. Crea el primero para dar de alta sus sociedades.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Cliente</Th>
              <Th>Paquete</Th>
              <Th className="text-right">€/mes</Th>
              <Th className="text-right">Sociedades</Th>
              <Th>Gestor responsable</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.status === "archived" ? "text-muted" : undefined}>
                <Td>
                  <Link href={`/clientes/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  {r.status === "archived" && (
                    <span className="ml-2">
                      <Badge tone="muted">Archivado</Badge>
                    </span>
                  )}
                </Td>
                <Td>{PLAN_LABELS[r.plan]}</Td>
                <Td className="num text-right">
                  {formatEuros((r.customMonthlyPriceCents ?? PLANS[r.plan].basePriceCents ?? 0) as Cents)}
                </Td>
                <Td className="num text-right">{r.entityCount}</Td>
                <Td>{r.managerName ?? <span className="text-muted">Sin asignar</span>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
