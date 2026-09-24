import "server-only";
import type { AccessContext } from "@/modules/access/context";
import { flattenCategories, listCategories } from "@/modules/accounting/categories";
import { listCounterparties } from "@/modules/accounting/counterparties";

export async function entryFormOptions(access: AccessContext, entityId: string) {
  const [tree, parties] = await Promise.all([listCategories(access, entityId), listCounterparties(access, entityId)]);
  return {
    categories: flattenCategories(tree),
    parties: parties.map((p) => ({ id: p.id, name: p.name })),
  };
}
