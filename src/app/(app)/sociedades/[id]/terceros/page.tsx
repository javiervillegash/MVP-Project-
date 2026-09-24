import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, Input, Table, Td, Th } from "@/components/ui/primitives";
import { can } from "@/modules/access/context";
import { LIST_LIMIT, listCounterparties } from "@/modules/accounting/counterparties";
import { requireAccess } from "@/modules/identity/session";

export const metadata: Metadata = { title: "Clientes y proveedores" };

const FILTERS = [
  { key: "", label: "Todos" },
  { key: "clientes", label: "Clientes" },
  { key: "proveedores", label: "Proveedores" },
] as const;

export default async function CounterpartiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string; q?: string; archivados?: string }>;
}) {
  const { id } = await params;
  const { tipo = "", q = "", archivados } = await searchParams;
  const { access } = await requireAccess();
  const role = tipo === "clientes" ? "customer" : tipo === "proveedores" ? "supplier" : undefined;
  const rows = await listCounterparties(access, id, { role, q, includeArchived: archivados === "1" });
  const base = `/sociedades/${id}/terceros`;
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({
      ...(tipo && { tipo }),
      ...(q && { q }),
      ...(archivados && { archivados }),
      ...over,
    });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={qs({ tipo: f.key })}
              className={
                "rounded-md px-3 py-1.5 text-sm " +
                (tipo === f.key ? "bg-surface-muted font-medium" : "text-muted hover:text-text")
              }
            >
              {f.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <form action={base} className="w-56">
            {tipo && <input type="hidden" name="tipo" value={tipo} />}
            <Input name="q" placeholder="Buscar nombre o NIF" defaultValue={q} aria-label="Buscar" />
          </form>
          {can(access, "party.write", id) && (
            <Link href={`${base}/nuevo${tipo === "clientes" ? "?tipo=cliente" : ""}`} className={buttonClass()}>
              Nuevo
            </Link>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          {q ? "No hay resultados para esa búsqueda." : "Todavía no hay clientes ni proveedores en esta sociedad."}
        </p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>NIF</Th>
              <Th>Tipo</Th>
              <Th className="text-right">Plazo</Th>
              <Th>Email</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.status === "archived" ? "text-muted" : undefined}>
                <Td>
                  <Link href={`${base}/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  {r.status === "archived" && (
                    <span className="ml-2">
                      <Badge tone="muted">Archivado</Badge>
                    </span>
                  )}
                </Td>
                <Td className="num">
                  {r.taxId ? `${r.taxIdCountry !== "ES" ? r.taxIdCountry + " " : ""}${r.taxId}` : "—"}
                </Td>
                <Td>
                  <div className="flex gap-1">
                    {r.isCustomer && <Badge tone="accent">Cliente</Badge>}
                    {r.isSupplier && <Badge>Proveedor</Badge>}
                  </div>
                </Td>
                <Td className="num text-right">{r.paymentTermsDays} días</Td>
                <Td className="text-muted">{r.email ?? ""}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <div className="mt-3 flex justify-between text-xs text-muted">
        <span>
          {rows.length === LIST_LIMIT
            ? `Se muestran los primeros ${LIST_LIMIT}; usa el buscador.`
            : `${rows.length} resultados`}
        </span>
        <Link href={qs({ archivados: archivados === "1" ? "" : "1" })} className="underline">
          {archivados === "1" ? "Ocultar archivados" : "Mostrar archivados"}
        </Link>
      </div>
    </>
  );
}
