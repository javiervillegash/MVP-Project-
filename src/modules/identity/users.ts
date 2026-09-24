import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { authAccount, authUser } from "@/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = NodePgDatabase<any>;

export interface NewUser {
  email: string;
  name: string;
  password: string;
  /** true si la contraseña la ha visto otra persona (invitaciones, alta inicial). */
  mustChangePassword?: boolean;
}

/**
 * Crea un usuario con contraseña, compatible con Better Auth (cuenta
 * "credential" con el hash de la librería). Lo usan los scripts de alta;
 * en la Fase 1 bloque 2 lo usará también la pantalla de invitaciones.
 */
export async function createCredentialUser(tx: AnyTx, input: NewUser): Promise<string> {
  const email = input.email.trim().toLowerCase();
  if (input.password.length < 12) throw new Error("La contraseña debe tener al menos 12 caracteres");

  const existing = await tx.select({ id: authUser.id }).from(authUser).where(eq(authUser.email, email));
  if (existing.length > 0) throw new Error(`Ya existe un usuario con el email ${email}`);

  const id = crypto.randomUUID();
  await tx.insert(authUser).values({
    id,
    email,
    name: input.name.trim(),
    emailVerified: true,
    mustChangePassword: input.mustChangePassword ?? false,
  });
  await tx.insert(authAccount).values({
    id: crypto.randomUUID(),
    userId: id,
    accountId: id,
    providerId: "credential",
    password: await hashPassword(input.password),
  });
  return id;
}

/** Contraseña aleatoria legible para altas iniciales (se cambia al entrar). */
export function generatePassword(length = 20): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
