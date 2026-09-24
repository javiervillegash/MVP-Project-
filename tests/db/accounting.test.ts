import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { categories, counterparties } from "@/db/schema";
import { withDbContext } from "@/db/tenant";
import { AccessDeniedError, resolveAccess, toDbContext } from "@/modules/access/context";
import {
  applyTemplateToEntity,
  createCategory,
  flattenCategories,
  listCategories,
  setCategoryStatus,
  updateCategory,
} from "@/modules/accounting/categories";
import { EXPENSE_TEMPLATE, INCOME_TEMPLATE } from "@/modules/accounting/category-template";
import {
  createCounterparty,
  listCounterparties,
  setCounterpartyStatus,
  updateCounterparty,
  type CounterpartyInput,
} from "@/modules/accounting/counterparties";
import { createLegalEntity } from "@/modules/tenancy/service";
import { createScenario, expectDbError, ownerDb } from "../helpers/db";

const owner = ownerDb();
let A: Awaited<ReturnType<typeof createScenario>>;
let B: Awaited<ReturnType<typeof createScenario>>;
const access = async (userId: string) => (await resolveAccess(userId))!;
const templateCount = [...INCOME_TEMPLATE, ...EXPENSE_TEMPLATE].reduce((n, t) => n + 1 + (t.children?.length ?? 0), 0);

beforeAll(async () => {
  A = await createScenario(owner.db, "AccA");
  B = await createScenario(owner.db, "AccB");
  // Las sociedades del escenario se crean sin plantilla: se aplica aquí.
  await applyTemplateToEntity(await access(A.users.admin), A.entities.e1a.id);
  await applyTemplateToEntity(await access(B.users.admin), B.entities.e1a.id);
});
afterAll(async () => {
  await closeDb();
  await owner.pool.end();
});

const supplier = (over: Partial<CounterpartyInput> = {}): CounterpartyInput => ({
  name: "Endesa Energía SAU",
  taxId: "A81948077",
  isCustomer: false,
  isSupplier: true,
  paymentTermsDays: 15,
  ...over,
});

describe("plantilla de categorías", () => {
  it("una sociedad nueva nace con toda la plantilla PGC", async () => {
    const admin = await access(A.users.admin);
    const id = await createLegalEntity(admin, A.companies.c2.id, {
      legalName: "Plantilla SL",
      taxId: "B22222228",
      legalForm: "sl",
      vatRegime: "general",
      vatFilingFrequency: "trimestral",
      fiscalYearStartMonth: 1,
    });
    const rows = await owner.db.select().from(categories).where(eq(categories.legalEntityId, id));
    expect(rows).toHaveLength(templateCount);
    const elec = rows.find((r) => r.templateKey === "suministros.electricidad")!;
    const parent = rows.find((r) => r.id === elec.parentId)!;
    expect(parent.templateKey).toBe("suministros");
    expect(elec).toMatchObject({ kind: "expense", pgcAccount: "628", plLine: "suministros" });
  });

  it("aplicarla otra vez no duplica nada", async () => {
    const created = await applyTemplateToEntity(await access(A.users.admin), A.entities.e1a.id);
    expect(created).toBe(0);
  });

  it("el árbol agrupa subcategorías bajo su principal", async () => {
    const tree = await listCategories(await access(A.users.gestor), A.entities.e1a.id);
    const sum = tree.find((c) => c.name === "Suministros")!;
    expect(sum.children.map((c) => c.name)).toEqual(["Electricidad", "Agua", "Gas", "Telecomunicaciones"]);
    const flat = flattenCategories(tree, "expense");
    expect(flat.find((f) => f.label === "Suministros › Electricidad")).toBeTruthy();
    expect(flattenCategories(tree, "income").every((f) => f.kind === "income")).toBe(true);
  });
});

describe("categorías propias", () => {
  it("el gestor crea una subcategoría; nombres repetidos en el mismo nivel no", async () => {
    const gestor = await access(A.users.gestor);
    const tree = await listCategories(gestor, A.entities.e1a.id);
    const otros = tree.find((c) => c.name === "Otros gastos de explotación")!;
    const id = await createCategory(gestor, A.entities.e1a.id, {
      kind: "expense",
      parentId: otros.id,
      name: "Formación",
      pgcAccount: "629",
      plLine: "otros_gastos",
    });
    expect(id).toBeTypeOf("string");
    await expect(
      createCategory(gestor, A.entities.e1a.id, {
        kind: "expense",
        parentId: otros.id,
        name: "formación",
        plLine: "otros_gastos",
      }),
    ).rejects.toThrow(/Ya existe una categoría/);
  });

  it("valida que la línea de resultados corresponda al tipo", async () => {
    await expect(
      createCategory(await access(A.users.gestor), A.entities.e1a.id, {
        kind: "income",
        name: "Rara",
        plLine: "personal",
      }),
    ).rejects.toThrow(/no corresponde/);
  });

  it("no admite tres niveles ni mezclar ingreso con gasto", async () => {
    const gestor = await access(A.users.gestor);
    const tree = await listCategories(gestor, A.entities.e1a.id);
    const elec = tree.find((c) => c.name === "Suministros")!.children[0];
    await expect(
      createCategory(gestor, A.entities.e1a.id, {
        kind: "expense",
        parentId: elec.id,
        name: "Nivel 3",
        plLine: "suministros",
      }),
    ).rejects.toThrow(/dos niveles/);
    const ventas = tree.find((c) => c.kind === "income")!;
    await expect(
      createCategory(gestor, A.entities.e1a.id, {
        kind: "expense",
        parentId: ventas.id,
        name: "Mezcla",
        plLine: "otros_gastos",
      }),
    ).rejects.toThrow(/otro tipo/);
  });

  it("no se puede colgar una categoría de otra sociedad (aunque se conozca su id)", async () => {
    const [foreign] = await owner.db
      .select()
      .from(categories)
      .where(eq(categories.legalEntityId, B.entities.e1a.id))
      .limit(1);
    await expect(
      createCategory(await access(A.users.admin), A.entities.e1a.id, {
        kind: foreign.kind,
        parentId: foreign.id,
        name: "Intrusa",
        plLine: foreign.plLine,
      }),
    ).rejects.toThrow(/otra sociedad/);
  });

  it("renombrar mantiene el tipo; archivar la principal archiva sus hijas", async () => {
    const gestor = await access(A.users.gestor);
    let tree = await listCategories(gestor, A.entities.e1a.id);
    const personal = tree.find((c) => c.name === "Personal")!;
    await updateCategory(gestor, A.entities.e1a.id, personal.id, {
      name: "Personal y nóminas",
      plLine: "personal",
      pgcAccount: "64",
    });
    await setCategoryStatus(gestor, A.entities.e1a.id, personal.id, "archived");
    tree = await listCategories(gestor, A.entities.e1a.id);
    expect(tree.find((c) => c.id === personal.id)).toBeUndefined();
    const all = await listCategories(gestor, A.entities.e1a.id, { includeArchived: true });
    const p = all.find((c) => c.id === personal.id)!;
    expect(p.name).toBe("Personal y nóminas");
    expect(p.children.every((c) => c.status === "archived")).toBe(true);
    await expect(setCategoryStatus(gestor, A.entities.e1a.id, p.children[0].id, "active")).rejects.toThrow(/principal/);
  });

  it("un director puede ver las categorías pero no cambiarlas", async () => {
    const director = await access(A.users.director);
    await expect(listCategories(director, A.entities.e2.id)).resolves.toBeInstanceOf(Array);
    await expect(
      createCategory(director, A.entities.e2.id, { kind: "expense", name: "No", plLine: "otros_gastos" }),
    ).rejects.toThrow(AccessDeniedError);
  });

  it("la aplicación no puede borrar categorías", async () => {
    const admin = await access(A.users.admin);
    await expectDbError(
      withDbContext(toDbContext(admin), (tx) =>
        tx.delete(categories).where(eq(categories.legalEntityId, A.entities.e1a.id)),
      ),
      /permission denied/,
    );
  });
});

describe("terceros", () => {
  it("crea un proveedor con NIF e IBAN normalizados y categoría por defecto", async () => {
    const gestor = await access(A.users.gestor);
    const elec = flattenCategories(await listCategories(gestor, A.entities.e1a.id), "expense").find(
      (c) => c.label === "Suministros › Electricidad",
    )!;
    const id = await createCounterparty(
      gestor,
      A.entities.e1a.id,
      supplier({ taxId: "a-81948077", iban: "es91 2100 0418 4502 0005 1332", defaultExpenseCategoryId: elec.id }),
    );
    const [row] = await owner.db.select().from(counterparties).where(eq(counterparties.id, id));
    expect(row).toMatchObject({
      taxId: "A81948077",
      iban: "ES9121000418450200051332",
      isSupplier: true,
      defaultExpenseCategoryId: elec.id,
    });
  });

  it("rechaza NIF e IBAN incorrectos y terceros sin papel", async () => {
    const gestor = await access(A.users.gestor);
    await expect(createCounterparty(gestor, A.entities.e1a.id, supplier({ taxId: "A81948070" }))).rejects.toThrow(
      /NIF no es válido/,
    );
    await expect(
      createCounterparty(gestor, A.entities.e1a.id, supplier({ taxId: null, iban: "ES9121000418450200051333" })),
    ).rejects.toThrow(/IBAN no es válido/);
    await expect(
      createCounterparty(gestor, A.entities.e1a.id, supplier({ taxId: null, isSupplier: false })),
    ).rejects.toThrow(/cliente, proveedor o ambos/);
  });

  it("no duplica NIF en la misma sociedad, pero sí en otra", async () => {
    const gestor = await access(A.users.gestor);
    await expect(createCounterparty(gestor, A.entities.e1a.id, supplier())).rejects.toThrow(/Ya existe un tercero/);
    await expect(createCounterparty(gestor, A.entities.e1b.id, supplier())).resolves.toBeTypeOf("string");
  });

  it("admite identificadores extranjeros y terceros sin NIF", async () => {
    const gestor = await access(A.users.gestor);
    await createCounterparty(gestor, A.entities.e1a.id, {
      name: "Google Ireland Ltd",
      taxId: "IE 6388047V",
      taxIdCountry: "IE",
      isCustomer: false,
      isSupplier: true,
      paymentTermsDays: 0,
    });
    await createCounterparty(gestor, A.entities.e1a.id, {
      name: "Cliente particular",
      isCustomer: true,
      isSupplier: false,
      paymentTermsDays: 0,
    });
    const found = await listCounterparties(gestor, A.entities.e1a.id, { q: "google" });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ taxId: "6388047V", taxIdCountry: "IE" });
  });

  it("filtra por papel y busca por NIF", async () => {
    const gestor = await access(A.users.gestor);
    const customers = await listCounterparties(gestor, A.entities.e1a.id, { role: "customer" });
    expect(customers.every((c) => c.isCustomer)).toBe(true);
    expect((await listCounterparties(gestor, A.entities.e1a.id, { q: "a-8194" }))[0]?.name).toBe("Endesa Energía SAU");
  });

  it("no acepta como categoría por defecto una de otra sociedad", async () => {
    const [foreign] = await owner.db
      .select()
      .from(categories)
      .where(eq(categories.legalEntityId, A.entities.e1a.id))
      .limit(1);
    await expect(
      createCounterparty(await access(A.users.gestor), A.entities.e1b.id, {
        ...supplier({ name: "Otro", taxId: null }),
        defaultExpenseCategoryId: foreign.id,
      }),
    ).rejects.toThrow(/no es válida para esta sociedad/);
  });

  it("editar, archivar y permisos", async () => {
    const gestor = await access(A.users.gestor);
    const [endesa] = await listCounterparties(gestor, A.entities.e1a.id, { q: "Endesa" });
    await updateCounterparty(gestor, A.entities.e1a.id, endesa.id, supplier({ name: "Endesa", isCustomer: true }));
    await setCounterpartyStatus(gestor, A.entities.e1a.id, endesa.id, "archived");
    expect(await listCounterparties(gestor, A.entities.e1a.id, { q: "Endesa" })).toHaveLength(0);
    expect(await listCounterparties(gestor, A.entities.e1a.id, { q: "Endesa", includeArchived: true })).toHaveLength(1);

    const director = await access(A.users.director);
    await expect(createCounterparty(director, A.entities.e2.id, supplier())).rejects.toThrow(AccessDeniedError);
    const gestoria = await access(A.users.gestoria);
    await expect(listCounterparties(gestoria, A.entities.e1a.id)).resolves.toBeInstanceOf(Array);
    await expect(listCounterparties(gestoria, A.entities.e2.id)).rejects.toThrow(AccessDeniedError);
  });

  it("otra organización no ve los terceros de A", async () => {
    const adminB = await access(B.users.admin);
    const rows = await withDbContext(toDbContext(adminB), (tx) => tx.select().from(counterparties));
    expect(rows.some((r) => r.organizationId === A.org.id)).toBe(false);
  });
});
