import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryForm } from "@/components/forms/category-form";
import { Badge, Button } from "@/components/ui/primitives";
import { isUuid } from "@/lib/ids";
import { can } from "@/modules/access/context";
import { getCategory, listParentOptions } from "@/modules/accounting/categories";
import { requireAccess } from "@/modules/identity/session";
import { setCategoryStatusAction, updateCategoryAction } from "../../actions";

export const metadata: Metadata = { title: "Categoría" };

export default async function CategoryPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  if (!isUuid(cid)) notFound();
  const { access } = await requireAccess();
  const category = await getCategory(access, id, cid);
  if (!category) notFound();
  const parents = (await listParentOptions(access, id, category.kind))
    .filter((p) => p.id !== cid)
    .map((p) => ({ ...p, kind: category.kind }));
  const canWrite = can(access, "category.write", id);
  const archived = category.status === "archived";

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href={`/sociedades/${id}/categorias`} className="text-sm text-muted">
          ← Categorías
        </Link>
        {canWrite && (
          <form action={setCategoryStatusAction.bind(null, id, cid, archived ? "active" : "archived")}>
            <Button type="submit" variant="secondary">
              {archived ? "Reactivar" : "Archivar"}
            </Button>
          </form>
        )}
      </div>
      <h2 className="mb-1 text-lg font-semibold">
        {category.name} <Badge tone="muted">{category.kind === "income" ? "Ingreso" : "Gasto"}</Badge>
        {archived && (
          <span className="ml-2">
            <Badge tone="muted">Archivada</Badge>
          </span>
        )}
      </h2>
      {!archived && category.activeChildren > 0 && (
        <p className="mb-3 text-xs text-muted">
          Tiene {category.activeChildren} subcategorías: si la archivas, se archivan también.
        </p>
      )}
      {canWrite && !archived ? (
        <CategoryForm
          action={updateCategoryAction.bind(null, id, cid)}
          parents={category.activeChildren > 0 ? [] : parents}
          defaults={category}
          lockKind
          submitLabel="Guardar cambios"
        />
      ) : (
        <p className="text-sm text-muted">
          Cuenta PGC {category.pgcAccount ?? "—"}. {canWrite ? "Reactívala para editarla." : ""}
        </p>
      )}
    </>
  );
}
