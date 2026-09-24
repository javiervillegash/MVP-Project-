import { sql } from "drizzle-orm";
import { getDb, type Database, type Tx } from "./client";

/**
 * Contexto de seguridad que se fija en PostgreSQL al inicio de cada
 * transacción. Las políticas RLS lo leen con app.current_org_id(), etc.
 */
export interface DbContext {
  userId: string;
  orgId?: string;
  orgWide?: boolean;
  entityIds?: readonly string[];
  companyIds?: readonly string[];
  requestId?: string;
}

const pgArray = (ids: readonly string[] = []) => `{${ids.join(",")}}`;

/**
 * Ejecuta `fn` en una transacción con el contexto de seguridad fijado.
 * Es la ÚNICA forma prevista de acceder a datos de negocio: fuera de ella las
 * tablas protegidas devuelven cero filas.
 */
export async function withDbContext<T>(ctx: DbContext, fn: (tx: Tx) => Promise<T>, db: Database = getDb()): Promise<T> {
  return db.transaction(async (tx) => {
    // set_config(..., true) limita el valor a esta transacción: no se filtra
    // a otras peticiones que reutilicen la conexión del pool.
    await tx.execute(sql`
      select
        set_config('app.user_id', ${ctx.userId}, true),
        set_config('app.org_id', ${ctx.orgId ?? ""}, true),
        set_config('app.org_wide', ${ctx.orgWide ? "on" : "off"}, true),
        set_config('app.entity_ids', ${pgArray(ctx.entityIds)}, true),
        set_config('app.company_ids', ${pgArray(ctx.companyIds)}, true),
        set_config('app.request_id', ${ctx.requestId ?? ""}, true)
    `);
    return fn(tx);
  });
}
