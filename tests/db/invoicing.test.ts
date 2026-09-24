import { eq } from "drizzle-orm";
import { rm } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { auditLog, documents, invoiceLines, invoices } from "@/db/schema";
import { withDbContext } from "@/db/tenant";
import { AccessDeniedError, resolveAccess, toDbContext } from "@/modules/access/context";
import { applyTemplateToEntity, flattenCategories, listCategories } from "@/modules/accounting/categories";
import { createCounterparty } from "@/modules/accounting/counterparties";
import { listDocuments, listDocumentsFor, readDocument, uploadDocument } from "@/modules/documents/service";
import { createEntry, listEntries, setEntryStatus } from "@/modules/invoicing/entries";
import {
  createInvoice,
  getInvoice,
  listInvoices,
  setInvoiceStatus,
  suggestNextNumber,
  updateInvoice,
  type InvoiceInput,
} from "@/modules/invoicing/invoices";
import { createScenario, expectDbError, ownerDb } from "../helpers/db";

const owner = ownerDb();
let A: Awaited<ReturnType<typeof createScenario>>;
let B: Awaited<ReturnType<typeof createScenario>>;
const access = async (userId: string) => (await resolveAccess(userId))!;
const ids = { customer: "", supplier: "", both: "", income: "", expense: "", foreignExpense: "", supplierB: "" };
const PDF = (tag: string) => Buffer.from(`%PDF-1.7\n% ${tag}\n%%EOF`);

beforeAll(async () => {
  await rm(process.env.STORAGE_DIR!, { recursive: true, force: true });
  A = await createScenario(owner.db, "InvA");
  B = await createScenario(owner.db, "InvB");
  const admin = await access(A.users.admin);
  await applyTemplateToEntity(admin, A.entities.e1a.id);
  await applyTemplateToEntity(await access(B.users.admin), B.entities.e1a.id);
  const tree = await listCategories(admin, A.entities.e1a.id);
  ids.income = flattenCategories(tree, "income")[0].id;
  ids.expense = flattenCategories(tree, "expense").find((c) => c.label.endsWith("Electricidad"))!.id;
  const treeB = await listCategories(await access(B.users.admin), B.entities.e1a.id);
  ids.foreignExpense = flattenCategories(treeB, "expense")[0].id;
  ids.customer = await createCounterparty(admin, A.entities.e1a.id, {
    name: "Cliente Uno SL",
    taxId: "B22222228",
    isCustomer: true,
    isSupplier: false,
    paymentTermsDays: 30,
  });
  ids.supplier = await createCounterparty(admin, A.entities.e1a.id, {
    name: "Endesa",
    taxId: "A81948077",
    isCustomer: false,
    isSupplier: true,
    paymentTermsDays: 15,
  });
  ids.supplierB = await createCounterparty(await access(B.users.admin), B.entities.e1a.id, {
    name: "Proveedor de B",
    isCustomer: false,
    isSupplier: true,
    paymentTermsDays: 15,
  });
});
afterAll(async () => {
  await closeDb();
  await owner.pool.end();
});

const issued = (over: Partial<InvoiceInput> = {}): InvoiceInput => ({
  direction: "issued",
  counterpartyId: ids.customer,
  series: "F",
  number: "2026-001",
  issueDate: "2026-09-01",
  dueDate: "2026-10-01",
  lines: [
    {
      description: "Consultoría septiembre",
      quantityMilli: 10_000,
      unitPriceCents: 8000,
      vatRateBp: 2100,
      withholdingRateBp: 1500,
      categoryId: ids.income,
    },
  ],
  ...over,
});
const received = (over: Partial<InvoiceInput> = {}): InvoiceInput => ({
  direction: "received",
  counterpartyId: ids.supplier,
  number: "E-555",
  issueDate: "2026-09-05",
  dueDate: "2026-09-20",
  declaredTotalCents: 12100,
  lines: [
    { description: "Luz agosto", quantityMilli: 1000, unitPriceCents: 10000, vatRateBp: 2100, categoryId: ids.expense },
  ],
  ...over,
});

describe("facturas emitidas", () => {
  it("el servidor calcula los importes (ignora cualquier total del navegador)", async () => {
    const gestor = await access(A.users.gestor);
    const id = await createInvoice(gestor, A.entities.e1a.id, issued());
    const inv = (await getInvoice(gestor, A.entities.e1a.id, id))!;
    expect(inv).toMatchObject({
      baseCents: 80000,
      vatCents: 16800,
      withholdingCents: 12000,
      totalCents: 84800,
      counterpartyName: "Cliente Uno SL",
    });
    expect(inv.lines).toHaveLength(1);
  });

  it("serie + número únicos; propone el siguiente número", async () => {
    const gestor = await access(A.users.gestor);
    await expect(createInvoice(gestor, A.entities.e1a.id, issued({ number: "2026-001" }))).rejects.toThrow(
      /serie y número/,
    );
    expect(await suggestNextNumber(gestor, A.entities.e1a.id, "F")).toBe("2026-002");
    // Se basa en el número más alto, no en el último registrado.
    await createInvoice(gestor, A.entities.e1a.id, issued({ number: "2026-010" }));
    await createInvoice(gestor, A.entities.e1a.id, issued({ number: "2026-009" }));
    expect(await suggestNextNumber(gestor, A.entities.e1a.id, "F")).toBe("2026-011");
    // Otra serie puede repetir número.
    await expect(createInvoice(gestor, A.entities.e1a.id, issued({ series: "R" }))).resolves.toBeTypeOf("string");
  });

  it("validaciones: vencimiento, total positivo, rectificativas, categoría del tipo correcto", async () => {
    const gestor = await access(A.users.gestor);
    await expect(
      createInvoice(gestor, A.entities.e1a.id, issued({ number: "X1", dueDate: "2026-08-01" })),
    ).rejects.toThrow(/vencimiento/);
    const negative = issued({
      number: "X2",
      lines: [
        { description: "Abono", quantityMilli: -1000, unitPriceCents: 5000, vatRateBp: 2100, categoryId: ids.income },
      ],
    });
    await expect(createInvoice(gestor, A.entities.e1a.id, negative)).rejects.toThrow(/rectificativa/);
    await expect(createInvoice(gestor, A.entities.e1a.id, { ...negative, isCorrective: true })).resolves.toBeTypeOf(
      "string",
    );
    await expect(
      createInvoice(
        gestor,
        A.entities.e1a.id,
        issued({ number: "X3", lines: [{ ...issued().lines[0], categoryId: ids.expense }] }),
      ),
    ).rejects.toThrow(/categoría de la línea no es válida/);
  });

  it("una emitida debe ir a un cliente; no se puede usar un tercero de otra sociedad", async () => {
    const gestor = await access(A.users.gestor);
    await expect(
      createInvoice(gestor, A.entities.e1a.id, issued({ number: "X4", counterpartyId: ids.supplier })),
    ).rejects.toThrow(/a un cliente/);
    await expect(
      createInvoice(await access(A.users.admin), A.entities.e1a.id, received({ counterpartyId: ids.supplierB })),
    ).rejects.toThrow(/otra sociedad/);
  });
});

describe("facturas recibidas", () => {
  it("se registra con su PDF y el PDF se puede descargar", async () => {
    const gestor = await access(A.users.gestor);
    const id = await createInvoice(gestor, A.entities.e1a.id, received(), {
      name: "endesa-agosto.pdf",
      data: PDF("endesa"),
    });
    const docs = await listDocumentsFor(gestor, A.entities.e1a.id, { type: "invoice", id });
    expect(docs).toHaveLength(1);
    const file = await readDocument(gestor, docs[0].id);
    expect(file?.contentType).toBe("application/pdf");
    expect(file?.data.toString()).toContain("endesa");
  });

  it("el mismo número de factura puede repetirse entre proveedores, no en el mismo", async () => {
    const gestor = await access(A.users.gestor);
    await expect(createInvoice(gestor, A.entities.e1a.id, received())).rejects.toThrow(/ya está registrada/i);
  });

  it("avisa si el total del documento no cuadra (se guarda para revisarlo)", async () => {
    const gestor = await access(A.users.gestor);
    const id = await createInvoice(gestor, A.entities.e1a.id, received({ number: "E-556", declaredTotalCents: 12099 }));
    const inv = (await getInvoice(gestor, A.entities.e1a.id, id))!;
    expect(inv.totalCents).toBe(12100);
    expect(inv.declaredTotalCents).toBe(12099);
  });
});

describe("edición, anulación y estados", () => {
  it("editar reemplaza las líneas y recalcula; todo queda auditado", async () => {
    const gestor = await access(A.users.gestor);
    const id = await createInvoice(gestor, A.entities.e1a.id, issued({ number: "E-100" }));
    await updateInvoice(
      gestor,
      A.entities.e1a.id,
      id,
      issued({
        number: "E-100",
        lines: [
          { description: "A", quantityMilli: 1000, unitPriceCents: 1000, vatRateBp: 2100, categoryId: ids.income },
          { description: "B", quantityMilli: 2000, unitPriceCents: 1000, vatRateBp: 1000, categoryId: ids.income },
        ],
      }),
    );
    const inv = (await getInvoice(gestor, A.entities.e1a.id, id))!;
    expect(inv.lines.map((l) => l.description)).toEqual(["A", "B"]);
    expect(inv.totalCents).toBe(3000 + 210 + 200);
    const audit = await owner.db.select().from(auditLog).where(eq(auditLog.tableName, "invoice_lines"));
    expect(audit.some((r) => r.action === "DELETE")).toBe(true);
  });

  it("anular exige motivo; una anulada no se edita; incobrable solo para emitidas", async () => {
    const gestor = await access(A.users.gestor);
    const id = await createInvoice(gestor, A.entities.e1a.id, issued({ number: "E-200" }));
    await expect(setInvoiceStatus(gestor, A.entities.e1a.id, id, "void")).rejects.toThrow(/motivo/);
    await setInvoiceStatus(gestor, A.entities.e1a.id, id, "void", "Duplicada");
    await expect(updateInvoice(gestor, A.entities.e1a.id, id, issued({ number: "E-200" }))).rejects.toThrow(/anulada/);
    const rec = await createInvoice(gestor, A.entities.e1a.id, received({ number: "E-900" }));
    await expect(setInvoiceStatus(gestor, A.entities.e1a.id, rec, "uncollectible", "x")).rejects.toThrow(/emitida/);
  });

  it("vencidas y pendientes según la fecha de vencimiento", async () => {
    const gestor = await access(A.users.gestor);
    const overdue = await listInvoices(gestor, A.entities.e1a.id, { direction: "received", state: "overdue" });
    expect(overdue.length).toBeGreaterThan(0);
    expect(overdue.every((i) => i.derived === "overdue")).toBe(true);
    const voided = await listInvoices(gestor, A.entities.e1a.id, { direction: "issued", state: "void" });
    expect(voided.map((i) => i.number)).toContain("E-200");
    const all = await listInvoices(gestor, A.entities.e1a.id, { direction: "issued" });
    expect(all.map((i) => i.number)).not.toContain("E-200");
  });

  it("la aplicación no puede borrar facturas", async () => {
    const admin = await access(A.users.admin);
    await expectDbError(
      withDbContext(toDbContext(admin), (tx) =>
        tx.delete(invoices).where(eq(invoices.legalEntityId, A.entities.e1a.id)),
      ),
      /permission denied/,
    );
  });
});

describe("permisos y aislamiento", () => {
  it("director y gestoría ven facturas; no pueden registrarlas; el colaborador no las ve", async () => {
    const director = await access(A.users.director);
    await expect(listInvoices(director, A.entities.e2.id, { direction: "issued" })).resolves.toBeInstanceOf(Array);
    await expect(createInvoice(director, A.entities.e2.id, issued())).rejects.toThrow(AccessDeniedError);
    const gestoria = await access(A.users.gestoria);
    expect((await listInvoices(gestoria, A.entities.e1a.id, { direction: "issued" })).length).toBeGreaterThan(0);
    const member = await access(A.users.member);
    await expect(listInvoices(member, A.entities.e1b.id, { direction: "issued" })).rejects.toThrow(AccessDeniedError);
  });

  it("otra organización no ve facturas, líneas ni documentos de A", async () => {
    const adminB = await access(B.users.admin);
    const rows = await withDbContext(toDbContext(adminB), async (tx) => ({
      inv: await tx.select().from(invoices),
      lines: await tx.select().from(invoiceLines),
      docs: await tx.select().from(documents),
    }));
    expect(rows.inv.some((r) => r.organizationId === A.org.id)).toBe(false);
    expect(rows.lines.some((r) => r.organizationId === A.org.id)).toBe(false);
    expect(rows.docs.some((r) => r.organizationId === A.org.id)).toBe(false);
    const [docA] = await owner.db.select().from(documents).where(eq(documents.organizationId, A.org.id)).limit(1);
    expect(await readDocument(adminB, docA.id)).toBeNull();
  });
});

describe("documentos", () => {
  it("rechaza archivos que no son PDF/imagen/XML aunque se llamen .pdf", async () => {
    await expect(
      uploadDocument(
        await access(A.users.gestor),
        A.entities.e1a.id,
        { name: "virus.pdf", data: Buffer.from("MZ...") },
        "otros",
      ),
    ).rejects.toThrow(/Formato no admitido/);
  });

  it("subir el mismo archivo dos veces no lo duplica", async () => {
    const gestor = await access(A.users.gestor);
    const a = await uploadDocument(
      gestor,
      A.entities.e1a.id,
      { name: "contrato.pdf", data: PDF("contrato") },
      "contratos",
    );
    const b = await uploadDocument(
      gestor,
      A.entities.e1a.id,
      { name: "copia.pdf", data: PDF("contrato") },
      "contratos",
    );
    expect(b).toEqual({ id: a.id, reused: true });
    expect((await listDocuments(gestor, A.entities.e1a.id, { folder: "contratos" })).length).toBe(1);
  });

  it("el colaborador del cliente puede subir documentos a su sociedad", async () => {
    const member = await access(A.users.member);
    await expect(
      uploadDocument(member, A.entities.e1b.id, { name: "ticket.pdf", data: PDF("ticket") }, "facturas"),
    ).resolves.toMatchObject({ reused: false });
  });
});

describe("gastos e ingresos sin factura", () => {
  it("registra, lista con filtros y anula", async () => {
    const gestor = await access(A.users.gestor);
    const id = await createEntry(gestor, A.entities.e1a.id, {
      kind: "expense",
      entryDate: "2026-09-10",
      description: "Comisión mantenimiento",
      categoryId: ids.expense,
      amountCents: 1200,
      paymentMethod: "bank",
    });
    await expect(
      createEntry(gestor, A.entities.e1a.id, {
        kind: "income",
        entryDate: "2026-09-10",
        description: "Mal categorizado",
        categoryId: ids.expense,
        amountCents: 100,
      }),
    ).rejects.toThrow(/categoría no es válida/);
    await expect(
      createEntry(gestor, A.entities.e1a.id, {
        kind: "expense",
        entryDate: "2026-09-10",
        description: "IVA mayor",
        categoryId: ids.expense,
        amountCents: 100,
        vatCents: 150,
      }),
    ).rejects.toThrow(/IVA no puede ser mayor/);
    expect(
      (await listEntries(gestor, A.entities.e1a.id, { kind: "expense", from: "2026-09-01", to: "2026-09-30" })).length,
    ).toBe(1);
    await setEntryStatus(gestor, A.entities.e1a.id, id, "void");
    expect(await listEntries(gestor, A.entities.e1a.id)).toHaveLength(0);
  });
});
