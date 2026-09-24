/**
 * Aplica las migraciones pendientes con el usuario propietario.
 * Uso: npm run db:migrate
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export async function runMigrations(url = process.env.MIGRATION_DATABASE_URL) {
  if (!url) throw new Error("Falta MIGRATION_DATABASE_URL");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "src/db/migrations" });
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  runMigrations()
    .then(() => console.log("Migraciones aplicadas."))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
