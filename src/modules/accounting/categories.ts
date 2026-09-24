/**
 * Categorías de ingresos y gastos de una sociedad (dos niveles).
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db/client";
import { categories, legalEntities } from "@/db/schema";
import { withDbContext } from "@/db/tenant";
import { DomainError, pgConstraint, pgErrorCode } from "@/lib/errors";
import { assertCan, toDbContext, type AccessContext } from "@/modules/access/context";
import {
  EXPENSE_TEMPLATE,
  INCOME_TEMPLATE,
  PL_LINES_BY_KIND,
  type PlLine,
  type TemplateCategory,
} from "./category-template";

export type CategoryKind = "income" | "expense";

const PL_LINES = [
  "ingresos",
  "costes_directos",
  "personal",
  "alquiler",
  "suministros",
  "marketing",
  "servicios_profesionales",
  "otros_gastos",
  "resultado_financiero",
  "impuesto_beneficios",
] as const;

export const categoryInput = z
  .object({
    kind: z.enum(["income", "expense"]),
    parentId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(2, "Indica un nombre").max(80),
    pgcAccount: z
      .string()
      .trim()
      .regex(/^\d{1,10}$/, "La cuenta PGC solo admite números (p. ej. 628)")
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
    plLine: z.enum(PL_LINES),
  })
  .refine((v) => PL_LINES_BY_KIND[v.kind].includes(v.plLine as PlLine), {
    message: "Esa línea de la cuenta de resultados no corresponde a este tipo",
    path: ["plLine"],
  });
export type CategoryInput = z.input<typeof categoryInput>;

/** Traduce los errores de integridad de la BD a mensajes para el usuario. */
export function translateIntegrityError(e: unknown): never {
  const code = pgErrorCode(e);
  if (code === "23505" && pgConstraint(e) === "categories_entity_name_uq") {
    throw new DomainError("Ya existe una categoría con ese nombre en el mismo nivel", "name");
  }
  if (code === "23514") {
    const msg = (e as { cause?: { message?: string } }).cause?.message ?? (e as Error).message;
    throw new DomainError(msg.replace(/^.*?: /, ""));
  }
  throw e;
}

/** Comprueba que la sociedad existe, es visible y está activa. */
export async function assertActiveEntity(tx: Tx, legalEntityId: string) {
  const [e] = await tx
    .select({ status: legalEntities.status })
    .from(legalEntities)
    .where(eq(legalEntities.id, legalEntityId));
  if (!e) throw new DomainError("Sociedad no encontrada");
  if (e.status !== "active") throw new DomainError("La sociedad está archivada");
}

/**
 * Copia la plantilla PGC a una sociedad. Idempotente: solo crea las
 * categorías cuya clave de plantilla aún no existe.
 */
export async function applyCategoryTemplate(tx: Tx, organizationId: string, legalEntityId: string): Promise<number> {
  const existing = await tx
    .select({ key: categories.templateKey, id: categories.id })
    .from(categories)
    .where(eq(categories.legalEntityId, legalEntityId));
  const byKey = new Map(existing.filter((c) => c.key).map((c) => [c.key!, c.id]));
  let created = 0;

  const insertOne = async (
    kind: CategoryKind,
    t: Omit<TemplateCategory, "children">,
    order: number,
    parentId?: string,
  ) => {
    const found = byKey.get(t.key);
    if (found) return found;
    // Si el usuario ya creó una categoría con ese nombre, se respeta la suya
    // (ON CONFLICT evita abortar la transacción).
    const [row] = await tx
      .insert(categories)
      .values({
        organizationId,
        legalEntityId,
        kind,
        parentId: parentId ?? null,
        name: t.name,
        pgcAccount: t.pgc,
        plLine: t.pl,
        templateKey: t.key,
        sortOrder: order,
      })
      .onConflictDoNothing()
      .returning({ id: categories.id });
    if (!row) return undefined;
    created++;
    byKey.set(t.key, row.id);
    return row.id;
  };

  for (const [kind, template] of [
    ["income", INCOME_TEMPLATE],
    ["expense", EXPENSE_TEMPLATE],
  ] as const) {
    for (const [i, t] of template.entries()) {
      const parentId = await insertOne(kind, t, i * 10);
      if (!parentId) continue;
      for (const [j, child] of (t.children ?? []).entries()) await insertOne(kind, child, j * 10, parentId);
    }
  }
  return created;
}

export async function applyTemplateToEntity(access: AccessContext, legalEntityId: string): Promise<number> {
  assertCan(access, "category.write", legalEntityId);
  return withDbContext(toDbContext(access), async (tx) => {
    await assertActiveEntity(tx, legalEntityId);
    return applyCategoryTemplate(tx, access.orgId, legalEntityId);
  });
}

export interface CategoryNode {
  id: string;
  kind: CategoryKind;
  name: string;
  pgcAccount: string | null;
  plLine: PlLine;
  status: "active" | "archived";
  parentId: string | null;
  children: CategoryNode[];
}

/** Árbol de categorías de la sociedad, ordenado como la plantilla. */
export async function listCategories(
  access: AccessContext,
  legalEntityId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<CategoryNode[]> {
  assertCan(access, "entity.view", legalEntityId);
  const rows = await withDbContext(toDbContext(access), (tx) =>
    tx
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.legalEntityId, legalEntityId),
          opts.includeArchived ? undefined : eq(categories.status, "active"),
        ),
      )
      .orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.name)),
  );
  const nodes = new Map<string, CategoryNode>(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        kind: r.kind,
        name: r.name,
        pgcAccount: r.pgcAccount,
        plLine: r.plLine,
        status: r.status,
        parentId: r.parentId,
        children: [],
      },
    ]),
  );
  const roots: CategoryNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else if (!n.parentId) roots.push(n);
  }
  return roots;
}

/** Lista plana "Principal › Sub" para selectores. */
export function flattenCategories(tree: CategoryNode[], kind?: CategoryKind) {
  const out: { id: string; label: string; kind: CategoryKind }[] = [];
  for (const root of tree) {
    if (kind && root.kind !== kind) continue;
    out.push({ id: root.id, label: root.name, kind: root.kind });
    for (const c of root.children) out.push({ id: c.id, label: `${root.name} › ${c.name}`, kind: c.kind });
  }
  return out;
}

export async function getCategory(access: AccessContext, legalEntityId: string, categoryId: string) {
  assertCan(access, "entity.view", legalEntityId);
  return withDbContext(toDbContext(access), async (tx) => {
    const [row] = await tx
      .select()
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.legalEntityId, legalEntityId)));
    if (!row) return null;
    const children = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.parentId, categoryId), eq(categories.status, "active")));
    return { ...row, activeChildren: children.length };
  });
}

export async function createCategory(
  access: AccessContext,
  legalEntityId: string,
  input: CategoryInput,
): Promise<string> {
  assertCan(access, "category.write", legalEntityId);
  const data = categoryInput.parse(input);
  return withDbContext(toDbContext(access), async (tx) => {
    await assertActiveEntity(tx, legalEntityId);
    try {
      const [row] = await tx
        .insert(categories)
        .values({
          organizationId: access.orgId,
          legalEntityId,
          kind: data.kind,
          parentId: data.parentId ?? null,
          name: data.name,
          pgcAccount: data.pgcAccount ?? null,
          plLine: data.plLine,
          sortOrder: 1000,
        })
        .returning({ id: categories.id });
      return row.id;
    } catch (e) {
      translateIntegrityError(e);
    }
  });
}

export async function updateCategory(
  access: AccessContext,
  legalEntityId: string,
  categoryId: string,
  input: Omit<CategoryInput, "kind">,
): Promise<void> {
  assertCan(access, "category.write", legalEntityId);
  await withDbContext(toDbContext(access), async (tx) => {
    await assertActiveEntity(tx, legalEntityId);
    const [current] = await tx
      .select({ kind: categories.kind })
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.legalEntityId, legalEntityId)));
    if (!current) throw new DomainError("Categoría no encontrada");
    // El tipo (ingreso/gasto) no cambia: rompería los importes ya clasificados.
    const data = categoryInput.parse({ ...input, kind: current.kind });
    if (data.parentId === categoryId)
      throw new DomainError("Una categoría no puede ser su propia principal", "parentId");
    try {
      await tx
        .update(categories)
        .set({
          name: data.name,
          parentId: data.parentId ?? null,
          pgcAccount: data.pgcAccount ?? null,
          plLine: data.plLine,
        })
        .where(eq(categories.id, categoryId));
    } catch (e) {
      translateIntegrityError(e);
    }
  });
}

/**
 * Archiva o reactiva. Archivar una principal archiva sus subcategorías; una
 * subcategoría no se reactiva si su principal está archivada.
 */
export async function setCategoryStatus(
  access: AccessContext,
  legalEntityId: string,
  categoryId: string,
  status: "active" | "archived",
): Promise<void> {
  assertCan(access, "category.write", legalEntityId);
  await withDbContext(toDbContext(access), async (tx) => {
    await assertActiveEntity(tx, legalEntityId);
    const [cat] = await tx
      .select()
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.legalEntityId, legalEntityId)));
    if (!cat) throw new DomainError("Categoría no encontrada");
    if (status === "active" && cat.parentId) {
      const [parent] = await tx
        .select({ status: categories.status })
        .from(categories)
        .where(eq(categories.id, cat.parentId));
      if (parent?.status === "archived") throw new DomainError("Reactiva antes la categoría principal");
    }
    await tx.update(categories).set({ status }).where(eq(categories.id, categoryId));
    if (status === "archived") {
      await tx.update(categories).set({ status }).where(eq(categories.parentId, categoryId));
    }
  });
}

/** Principales activas de un tipo, para elegir "categoría principal". */
export async function listParentOptions(access: AccessContext, legalEntityId: string, kind: CategoryKind) {
  assertCan(access, "entity.view", legalEntityId);
  return withDbContext(toDbContext(access), (tx) =>
    tx
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(
        and(
          eq(categories.legalEntityId, legalEntityId),
          eq(categories.kind, kind),
          isNull(categories.parentId),
          inArray(categories.status, ["active"]),
        ),
      )
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
  );
}
