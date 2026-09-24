"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { runAction, str, type FormState } from "@/lib/action-state";
import { changeOwnPassword } from "@/modules/identity/password";
import { requireSession } from "@/modules/identity/session";

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { user } = await requireSession();
  const requestHeaders = await headers();
  const res = await runAction(() =>
    changeOwnPassword(user.id, requestHeaders, {
      currentPassword: str(fd, "currentPassword"),
      newPassword: String(fd.get("newPassword") ?? ""),
      confirmPassword: String(fd.get("confirmPassword") ?? ""),
    }),
  );
  if (res.ok && user.mustChangePassword) redirect("/");
  return res;
}
