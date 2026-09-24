import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { authLoginLockout } from "@/db/schema";

export const LOCKOUT_MAX_FAILURES = 5;
export const LOCKOUT_MINUTES = 15;

const normalize = (email: string) => email.trim().toLowerCase();

/** Si el email está bloqueado, devuelve hasta cuándo; si no, null. */
export async function lockedUntil(db: Database, email: string): Promise<Date | null> {
  const [row] = await db
    .select({ lockedUntil: authLoginLockout.lockedUntil })
    .from(authLoginLockout)
    .where(eq(authLoginLockout.email, normalize(email)));
  return row?.lockedUntil && row.lockedUntil > new Date() ? row.lockedUntil : null;
}

/**
 * Registra un intento fallido. Los fallos se cuentan dentro de una ventana de
 * 15 minutos; al quinto, el email queda bloqueado otros 15 minutos.
 */
export async function recordFailure(db: Database, email: string): Promise<void> {
  const window = sql.raw(`interval '${LOCKOUT_MINUTES} minutes'`);
  await db.execute(sql`
    insert into auth_login_lockout as l (email, failed_count, first_failed_at)
    values (${normalize(email)}, 1, now())
    on conflict (email) do update set
      failed_count = case when l.first_failed_at < now() - ${window} then 1 else l.failed_count + 1 end,
      first_failed_at = case when l.first_failed_at < now() - ${window} then now() else l.first_failed_at end,
      locked_until = case
        when l.first_failed_at >= now() - ${window} and l.failed_count + 1 >= ${LOCKOUT_MAX_FAILURES}
        then now() + ${window}
        else l.locked_until end
  `);
}

/** Tras un acceso correcto, se olvidan los fallos. */
export async function clearFailures(db: Database, email: string): Promise<void> {
  await db.delete(authLoginLockout).where(eq(authLoginLockout.email, normalize(email)));
}
