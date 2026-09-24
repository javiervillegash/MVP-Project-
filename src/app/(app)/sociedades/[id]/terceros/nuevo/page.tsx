import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CounterpartyForm } from "@/components/forms/counterparty-form";
import { can } from "@/modules/access/context";
import { flattenCategories, listCategories } from "@/modules/accounting/categories";
import { requireAccess } from "@/modules/identity/session";
import { createCounterpartyAction } from "../../actions";

export const metadata: Metadata = { title: "Nuevo cliente o proveedor" };

export default async function NewCounterpartyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { id } = await params;
  const { tipo } = await searchParams;
  const { access } = await requireAccess();
  if (!can(access, "party.write", id)) notFound();
  const tree = await listCategories(access, id);

  return (
    <>
      <div className="mb-4 text-sm text-muted">
        <Link href={`/sociedades/${id}/terceros`}>← Clientes y proveedores</Link>
      </div>
      <h2 className="mb-3 text-lg font-semibold">Nuevo cliente o proveedor</h2>
      <CounterpartyForm
        action={createCounterpartyAction.bind(null, id)}
        incomeCategories={flattenCategories(tree, "income")}
        expenseCategories={flattenCategories(tree, "expense")}
        presetRole={tipo === "cliente" ? "customer" : "supplier"}
        submitLabel="Guardar"
      />
    </>
  );
}
