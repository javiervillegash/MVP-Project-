import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Conexión de la aplicación (usuario `finanzas_app`, sujeto a RLS).
 * Se crea bajo demanda para que importar este módulo no abra conexiones
 * (build de Next.js, tests unitarios).
 */
let pool: Pool | undefined;
let database: Database | undefined;

export function getDb(): Database {
  if (!database) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta DATABASE_URL");
    pool = new Pool({ connectionString: url, max: 10 });
    database = drizzle(pool, { schema });
  }
  return database;
}

/** Solo para tests y scripts: cierra el pool. */
export async function closeDb() {
  await pool?.end();
  pool = undefined;
  database = undefined;
}
