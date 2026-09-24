import "server-only";
import type { AccessContext } from "@/modules/access/context";
import { flattenCategories, listCategories } from "@/modules/accounting/categories";
import { listCounterparties } from "@/modules/accounting/counterparties";
import type { PartyOption } from "@/components/forms/invoice-form";

/** Terceros y categorías que ofrece el formulario de factura según su tipo. */
export async function invoiceFormOptions(access: AccessContext, entityId: string, direction: "issued" | "received") {
  const [parties, tree] = await Promise.all([
    listCounterparties(access, entityId, { role: direction === "issued" ? "customer" : "supplier" }),
    listCategories(access, entityId),
  ]);
  const options: PartyOption[] = parties.map((p) => ({
    id: p.id,
    name: p.name,
    paymentTermsDays: p.paymentTermsDays,
    defaultCategoryId: direction === "issued" ? p.defaultIncomeCategoryId : p.defaultExpenseCategoryId,
  }));
  return { parties: options, categories: flattenCategories(tree, direction === "issued" ? "income" : "expense") };
}
