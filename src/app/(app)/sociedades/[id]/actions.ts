"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { keepValues, optStr, runAction, str, type FormState } from "@/lib/action-state";
import {
  applyTemplateToEntity,
  createCategory,
  setCategoryStatus,
  updateCategory,
  type CategoryInput,
} from "@/modules/accounting/categories";
import {
  createCounterparty,
  setCounterpartyStatus,
  updateCounterparty,
  type CounterpartyInput,
} from "@/modules/accounting/counterparties";
import { requireAccess } from "@/modules/identity/session";

// ------------------------------------------------------------------ terceros

function readCounterparty(fd: FormData): CounterpartyInput {
  const days = str(fd, "paymentTermsDays");
  return {
    name: str(fd, "name"),
    taxId: optStr(fd, "taxId"),
    taxIdCountry: str(fd, "taxIdCountry") || "ES",
    isCustomer: fd.get("isCustomer") === "on",
    isSupplier: fd.get("isSupplier") === "on",
    email: optStr(fd, "email"),
    phone: optStr(fd, "phone"),
    iban: optStr(fd, "iban"),
    paymentTermsDays: days === "" ? 30 : Number(days),
    defaultIncomeCategoryId: optStr(fd, "defaultIncomeCategoryId"),
    defaultExpenseCategoryId: optStr(fd, "defaultExpenseCategoryId"),
    notes: optStr(fd, "notes"),
  };
}

export async function createCounterpartyAction(entityId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { access } = await requireAccess();
  const res = await runAction(() => createCounterparty(access, entityId, readCounterparty(fd)));
  if (res.ok) redirect(`/sociedades/${entityId}/terceros`);
  return keepValues(res, fd);
}

export async function updateCounterpartyAction(
  entityId: string,
  counterpartyId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const { access } = await requireAccess();
  const res = await runAction(() => updateCounterparty(access, entityId, counterpartyId, readCounterparty(fd)));
  revalidatePath(`/sociedades/${entityId}/terceros`);
  return keepValues(res, fd);
}

export async function setCounterpartyStatusAction(
  entityId: string,
  counterpartyId: string,
  status: "active" | "archived",
) {
  const { access } = await requireAccess();
  await setCounterpartyStatus(access, entityId, counterpartyId, status);
  revalidatePath(`/sociedades/${entityId}/terceros`);
  revalidatePath(`/sociedades/${entityId}/terceros/${counterpartyId}`);
}

// ---------------------------------------------------------------- categorías

function readCategory(fd: FormData): CategoryInput {
  return {
    kind: str(fd, "kind") as CategoryInput["kind"],
    parentId: optStr(fd, "parentId"),
    name: str(fd, "name"),
    pgcAccount: optStr(fd, "pgcAccount"),
    plLine: str(fd, "plLine") as CategoryInput["plLine"],
  };
}

export async function createCategoryAction(entityId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { access } = await requireAccess();
  const res = await runAction(() => createCategory(access, entityId, readCategory(fd)));
  revalidatePath(`/sociedades/${entityId}/categorias`);
  // Tras crear, el formulario queda limpio para añadir otra.
  return res.ok ? { ok: true } : keepValues(res, fd);
}

export async function updateCategoryAction(
  entityId: string,
  categoryId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const { access } = await requireAccess();
  const { kind: _kind, ...rest } = readCategory(fd);
  const res = await runAction(() => updateCategory(access, entityId, categoryId, rest));
  revalidatePath(`/sociedades/${entityId}/categorias`);
  return keepValues(res, fd);
}

export async function setCategoryStatusAction(entityId: string, categoryId: string, status: "active" | "archived") {
  const { access } = await requireAccess();
  await setCategoryStatus(access, entityId, categoryId, status);
  revalidatePath(`/sociedades/${entityId}/categorias`);
  revalidatePath(`/sociedades/${entityId}/categorias/${categoryId}`);
}

export async function applyTemplateAction(entityId: string) {
  const { access } = await requireAccess();
  await applyTemplateToEntity(access, entityId);
  revalidatePath(`/sociedades/${entityId}/categorias`);
}
