import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { LEGAL_FORM_LABELS, ROLE_LABELS } from "@/modules/access/labels";
import { requireAccess } from "@/modules/identity/session";
import { listVisibleEntities } from "@/modules/tenancy/queries";

export const metadata: Metadata = { title: "Inicio" };

export default async function HomePage() {
  const { user, access } = await requireAccess();
  const entities = await listVisibleEntities(access);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold">Hola, {user.name.split(" ")[0]}</h1>
      <p className="mt-1 text-sm text-muted">
        {entities.length === 1 ? "Tienes acceso a 1 sociedad." : `Tienes acceso a ${entities.length} sociedades.`}
      </p>

      <Card className="mt-6 overflow-x-auto">
        {entities.length === 0 ? (
          <p className="p-6 text-sm text-muted">Aún no hay sociedades dadas de alta en esta organización.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Sociedad</th>
                <th className="px-4 py-3 font-medium">NIF</th>
                <th className="px-4 py-3 font-medium">Forma</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Tu rol</th>
              </tr>
            </thead>
            <tbody>
              {entities.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/sociedades/${e.id}`} className="hover:underline">
                      {e.legalName}
                    </Link>
                  </td>
                  <td className="num px-4 py-3">{e.taxId}</td>
                  <td className="px-4 py-3">{LEGAL_FORM_LABELS[e.legalForm] ?? e.legalForm}</td>
                  <td className="px-4 py-3 text-muted">{e.companyName}</td>
                  <td className="px-4 py-3">{e.roles.map((r) => ROLE_LABELS[r]).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
