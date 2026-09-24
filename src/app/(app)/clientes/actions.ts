"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { keepValues, optStr, runAction, str, type FormState } from "@/lib/action-state";
import { DomainError } from "@/lib/errors";
import { MoneyError, parseEuros } from "@/lib/money";
import { requireAccess } from "@/modules/identity/session";
import {
  archiveCompany,
  createCompany,
  createLegalEntity,
  reactivateCompany,
  setLegalEntityStatus,
  updateCompany,
  updateLegalEntity,
  type CompanyInput,
  type LegalEntityInput,
} from "@/modules/tenancy/service";

function readCompany(fd: FormData): CompanyInput {
  const price = str(fd, "customMonthlyPrice");
  let cents: number | null = null;
  if (price) {
    try {
      cents = parseEuros(price);
    } catch (e) {
      if (e instanceof MoneyError)
        throw new DomainError("Importe no válido (ej.: 2.500,00)", "customMonthlyPriceCents");
      throw e;
    }
  }
  return {
    name: str(fd, "name"),
    plan: str(fd, "plan") as CompanyInput["plan"],
    customMonthlyPriceCents: cents,
    managerUserId: optStr(fd, "managerUserId"),
  };
}

function readEntity(fd: FormData): LegalEntityInput {
  return {
    legalName: str(fd, "legalName"),
    taxId: str(fd, "taxId"),
    legalForm: str(fd, "legalForm") as LegalEntityInput["legalForm"],
    vatRegime: str(fd, "vatRegime") as LegalEntityInput["vatRegime"],
    vatFilingFrequency: str(fd, "vatFilingFrequency") as LegalEntityInput["vatFilingFrequency"],
    fiscalYearStartMonth: Number(str(fd, "fiscalYearStartMonth") || 1),
  };
}

export async function createCompanyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { access } = await requireAccess();
  const res = await runAction(() => createCompany(access, readCompany(fd)));
  if (res.ok && typeof res.data === "string") redirect(`/clientes/${res.data}`);
  return keepValues(res, fd);
}

export async function updateCompanyAction(companyId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { access } = await requireAccess();
  const res = await runAction(() => updateCompany(access, companyId, readCompany(fd)));
  revalidatePath(`/clientes/${companyId}`);
  return keepValues(res, fd);
}

export async function setCompanyStatusAction(companyId: string, status: "active" | "archived") {
  const { access } = await requireAccess();
  if (status === "archived") await archiveCompany(access, companyId);
  else await reactivateCompany(access, companyId);
  revalidatePath(`/clientes/${companyId}`);
  revalidatePath("/clientes");
}

export async function createEntityAction(companyId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { access } = await requireAccess();
  const res = await runAction(() => createLegalEntity(access, companyId, readEntity(fd)));
  if (res.ok) redirect(`/clientes/${companyId}`);
  return keepValues(res, fd);
}

export async function updateEntityAction(entityId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { access } = await requireAccess();
  const res = await runAction(() => updateLegalEntity(access, entityId, readEntity(fd)));
  revalidatePath(`/sociedades/${entityId}`);
  return keepValues(res, fd);
}

export async function setEntityStatusAction(entityId: string, companyId: string, status: "active" | "archived") {
  const { access } = await requireAccess();
  await setLegalEntityStatus(access, entityId, status);
  revalidatePath(`/clientes/${companyId}`);
  revalidatePath(`/sociedades/${entityId}`);
}
