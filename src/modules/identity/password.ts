import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { authUser } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { DomainError } from "@/lib/errors";

export const changePasswordInput = z
  .object({
    currentPassword: z.string().min(1, "Indica tu contraseña actual"),
    newPassword: z.string().min(12, "La nueva contraseña debe tener al menos 12 caracteres").max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: "La nueva contraseña debe ser distinta de la actual",
    path: ["newPassword"],
  });

/**
 * Cambia la contraseña del usuario de la sesión, cierra sus otras sesiones y
 * quita la obligación de cambiarla. Better Auth verifica la contraseña actual.
 */
export async function changeOwnPassword(
  userId: string,
  requestHeaders: Headers,
  input: z.input<typeof changePasswordInput>,
): Promise<void> {
  const data = changePasswordInput.parse(input);
  try {
    await getAuth().api.changePassword({
      body: { currentPassword: data.currentPassword, newPassword: data.newPassword, revokeOtherSessions: true },
      headers: requestHeaders,
    });
  } catch (e) {
    const code = (e as { body?: { code?: string } })?.body?.code;
    if (code === "INVALID_PASSWORD") throw new DomainError("La contraseña actual no es correcta", "currentPassword");
    throw e;
  }
  await getDb().update(authUser).set({ mustChangePassword: false }).where(eq(authUser.id, userId));
}
