/**
 * Activa el inicio de sesión del usuario de aplicación `finanzas_app` con la
 * contraseña de APP_DB_PASSWORD. La migración 0001 crea el rol sin login.
 * Uso: npm run db:roles
 */
import "dotenv/config";
import { Pool } from "pg";

export async function configureAppRole(
  url = process.env.MIGRATION_DATABASE_URL,
  password = process.env.APP_DB_PASSWORD,
) {
  if (!url) throw new Error("Falta MIGRATION_DATABASE_URL");
  if (!password || password.length < 12) {
    throw new Error("APP_DB_PASSWORD debe tener al menos 12 caracteres");
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const { rows } = await pool.query<{ stmt: string }>(
      "SELECT format('ALTER ROLE finanzas_app LOGIN PASSWORD %L', $1::text) AS stmt",
      [password],
    );
    await pool.query(rows[0].stmt);
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("db-roles.ts")) {
  configureAppRole()
    .then(() => console.log("Rol finanzas_app configurado."))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
