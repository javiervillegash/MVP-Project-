"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { keepValues, runAction, str, type FormState } from "@/lib/action-state";
import { DomainError } from "@/lib/errors";
import { requireAccess } from "@/modules/identity/session";
import { setDocumentStatus, unlinkDocument, uploadDocument, type DocumentFolder } from "@/modules/documents/service";
import { createEntry, setEntryStatus, updateEntry, type EntryInput } from "@/modules/invoicing/entries";
import { createInvoice, setInvoiceStatus, updateInvoice, type InvoiceInput } from "@/modules/invoicing/invoices";
import { MoneyError, parseEuros } from "@/lib/money";

/** Archivo opcional de un formulario, ya leído en memoria. */
async function readFile(fd: FormData, key: string) {
  const f = fd.get(key);
  if (!(f instanceof File) || f.size === 0) return undefined;
  return { name: f.name, data: Buffer.from(await f.arrayBuffer()) };
}

function readInvoice(fd: FormData): InvoiceInput {
  try {
    return JSON.parse(str(fd, "payload")) as InvoiceInput;
  } catch {
    throw new DomainError("Formulario incompleto; recarga la página");
  }
}

// ----------------------------------------------------------------- facturas

export async function createInvoiceAction(entityId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { access } = await requireAccess();
  const res = await runAction(async () =>
    createInvoice(access, entityId, readInvoice(fd), await readFile(fd, "attachment")),
  );
  if (res.ok && typeof res.data === "string") redirect(`/sociedades/${entityId}/facturas/${res.data}`);
  return res;
}

export async function updateInvoiceAction(
  entityId: string,
  invoiceId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const { access } = await requireAccess();
  const res = await runAction(() => updateInvoice(access, entityId, invoiceId, readInvoice(fd)));
  if (res.ok) redirect(`/sociedades/${entityId}/facturas/${invoiceId}`);
  return res;
}

export async function setInvoiceStatusAction(
  entityId: string,
  invoiceId: string,
  status: "active" | "uncollectible" | "void",
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const { access } = await requireAccess();
  const res = await runAction(() => setInvoiceStatus(access, entityId, invoiceId, status, str(fd, "reason")));
  revalidatePath(`/sociedades/${entityId}/facturas/${invoiceId}`);
  return res;
}

// --------------------------------------------------------------- documentos

export async function attachDocumentAction(
  entityId: string,
  target: { type: "invoice" | "manual_entry"; id: string } | null,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const { access } = await requireAccess();
  const res = await runAction(async () => {
    const file = await readFile(fd, "file");
    if (!file) throw new DomainError("Elige un archivo", "file");
    const folder = (str(fd, "folder") || "facturas") as DocumentFolder;
    return uploadDocument(access, entityId, file, folder, target ?? undefined);
  });
  revalidatePath(`/sociedades/${entityId}`, "layout");
  return res;
}

export async function unlinkDocumentAction(
  entityId: string,
  documentId: string,
  target: { type: "invoice" | "manual_entry"; id: string },
) {
  const { access } = await requireAccess();
  await unlinkDocument(access, entityId, documentId, target);
  revalidatePath(`/sociedades/${entityId}`, "layout");
}

export async function setDocumentStatusAction(entityId: string, documentId: string, status: "active" | "void") {
  const { access } = await requireAccess();
  await setDocumentStatus(access, entityId, documentId, status);
  revalidatePath(`/sociedades/${entityId}/documentos`);
}

// ---------------------------------------------------- gastos e ingresos

function readEntry(fd: FormData): EntryInput {
  const money = (key: string, required: boolean) => {
    const v = str(fd, key);
    if (!v) {
      if (required) throw new DomainError("Indica el importe", key);
      return 0;
    }
    try {
      return parseEuros(v);
    } catch (e) {
      if (e instanceof MoneyError) throw new DomainError("Importe no válido (ej.: 12,50)", key);
      throw e;
    }
  };
  return {
    kind: str(fd, "kind") as EntryInput["kind"],
    entryDate: str(fd, "entryDate"),
    description: str(fd, "description"),
    counterpartyId: str(fd, "counterpartyId") || null,
    categoryId: str(fd, "categoryId"),
    amountCents: money("amountCents", true),
    vatCents: money("vatCents", false),
    paymentMethod: (str(fd, "paymentMethod") || "bank") as EntryInput["paymentMethod"],
    notes: str(fd, "notes") || null,
  };
}

export async function createEntryAction(entityId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { access } = await requireAccess();
  const res = await runAction(async () =>
    createEntry(access, entityId, readEntry(fd), await readFile(fd, "attachment")),
  );
  if (res.ok) redirect(`/sociedades/${entityId}/apuntes`);
  return keepValues(res, fd);
}

export async function updateEntryAction(
  entityId: string,
  entryId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const { access } = await requireAccess();
  const res = await runAction(() => updateEntry(access, entityId, entryId, readEntry(fd)));
  revalidatePath(`/sociedades/${entityId}/apuntes`);
  return keepValues(res, fd);
}

export async function setEntryStatusAction(entityId: string, entryId: string, status: "active" | "void") {
  const { access } = await requireAccess();
  await setEntryStatus(access, entityId, entryId, status);
  revalidatePath(`/sociedades/${entityId}/apuntes`);
  revalidatePath(`/sociedades/${entityId}/apuntes/${entryId}`);
}
