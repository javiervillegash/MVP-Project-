import type { Metadata } from "next";
import Link from "next/link";
import { CategoryForm } from "@/components/forms/category-form";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { can } from "@/modules/access/context";
import { listCategories, type CategoryNode } from "@/modules/accounting/categories";
import { PL_LINE_LABELS } from "@/modules/accounting/category-template";
import { requireAccess } from "@/modules/identity/session";
import { applyTemplateAction, createCategoryAction } from "../actions";

export const metadata: Metadata = { title: "Categorías" };

function Row({ node, base, child }: { node: CategoryNode; base: string; child?: boolean }) {
  const archived = node.status === "archived";
  return (
    <li className={"flex items-baseline justify-between gap-3 px-4 py-2 text-sm " + (archived ? "text-muted" : "")}>
      <span className={child ? "pl-5" : "font-medium"}>
        <Link href={`${base}/${node.id}`} className="hover:underline">
          {node.name}
        </Link>
        {archived && (
          <span className="ml-2">
            <Badge tone="muted">Archivada</Badge>
          </span>
        )}
      </span>
      <span className="num shrink-0 text-xs text-muted">
        {node.pgcAccount && <span className="mr-3">{node.pgcAccount}</span>}
        {!child && PL_LINE_LABELS[node.plLine]}
      </span>
    </li>
  );
}

function Tree({ title, nodes, base }: { title: string; nodes: CategoryNode[]; base: string }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {nodes.length === 0 ? (
        <p className="text-sm text-muted">Sin categorías.</p>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {nodes.map((n) => (
              <li key={n.id}>
                <ul>
                  <Row node={n} base={base} />
                  {n.children.map((c) => (
                    <Row key={c.id} node={c} base={base} child />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

export default async function CategoriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ archivadas?: string }>;
}) {
  const { id } = await params;
  const { archivadas } = await searchParams;
  const { access } = await requireAccess();
  const showArchived = archivadas === "1";
  const tree = await listCategories(access, id, { includeArchived: showArchived });
  const canWrite = can(access, "category.write", id);
  const base = `/sociedades/${id}/categorias`;
  const parents = tree.filter((n) => n.status === "active").map((n) => ({ id: n.id, name: n.name, kind: n.kind }));

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">
        Sirven para clasificar ingresos y gastos y construir la cuenta de resultados. Parten del Plan General Contable y
        puedes adaptarlas a esta sociedad.
      </p>

      {tree.length === 0 && canWrite && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">Esta sociedad aún no tiene categorías.</p>
          <form action={applyTemplateAction.bind(null, id)}>
            <Button type="submit">Crear categorías del plan contable</Button>
          </form>
        </Card>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <Tree title="Gastos" nodes={tree.filter((n) => n.kind === "expense")} base={base} />
        <Tree title="Ingresos" nodes={tree.filter((n) => n.kind === "income")} base={base} />
      </div>

      <div className="flex justify-end text-xs text-muted">
        <Link href={showArchived ? base : `${base}?archivadas=1`} className="underline">
          {showArchived ? "Ocultar archivadas" : "Mostrar archivadas"}
        </Link>
      </div>

      {canWrite && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Nueva categoría</h2>
          <Card className="max-w-2xl p-4">
            <CategoryForm action={createCategoryAction.bind(null, id)} parents={parents} submitLabel="Añadir" compact />
          </Card>
        </section>
      )}
    </div>
  );
}
