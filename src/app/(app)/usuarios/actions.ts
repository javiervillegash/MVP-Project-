"use server";

import { revalidatePath } from "next/cache";
import { keepValues, runAction, str, type FormState } from "@/lib/action-state";
import type { Role } from "@/modules/access/permissions";
import { addGrant, inviteUser, revokeGrant, type GrantInput } from "@/modules/identity/members";
import { requireAccess } from "@/modules/identity/session";

function readGrant(fd: FormData): GrantInput {
  const role = str(fd, "role") as Role;
  const scope = str(fd, "scope");
  if (role === "org_admin") return { role };
  const [kind, id] = scope.split(":");
  return {
    role,
    companyId: kind === "company" ? id : null,
    legalEntityId: kind === "entity" ? id : null,
  };
}

export interface InviteData {
  userId: string;
  email: string;
  name: string;
  temporaryPassword: string | null;
}

export async function inviteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { access } = await requireAccess();
  const person = { name: str(fd, "name"), email: str(fd, "email") };
  const res = await runAction(async () => {
    const r = await inviteUser(access, person, readGrant(fd));
    return { ...r, email: person.email.toLowerCase(), name: person.name } satisfies InviteData;
  });
  revalidatePath("/usuarios");
  return keepValues(res, fd);
}

export async function addGrantAction(userId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { access } = await requireAccess();
  const res = await runAction(() => addGrant(access, userId, readGrant(fd)));
  revalidatePath(`/usuarios/${userId}`);
  return keepValues(res, fd);
}

export async function revokeGrantAction(membershipId: string, userId: string, _prev: FormState): Promise<FormState> {
  const { access } = await requireAccess();
  const res = await runAction(() => revokeGrant(access, membershipId));
  revalidatePath(`/usuarios/${userId}`);
  revalidatePath("/usuarios");
  return res;
}
