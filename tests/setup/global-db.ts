/**
 * Prepara una base de datos de test vacía y le aplica todas las migraciones.
 * Por seguridad, se niega a actuar sobre una BD cuyo nombre no acabe en _test.
 */
import { Pool } from "pg";
import { configureAppRole } from "../../scripts/db-roles";
import { runMigrations } from "../../scripts/migrate";
import { TEST_APP_PASSWORD, TEST_OWNER_URL } from "./env";

export default async function setup() {
  const url = TEST_OWNER_URL;
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith("_test")) {
    throw new Error(`La BD de test debe acabar en _test (recibido: ${dbName})`);
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query(`
      drop schema if exists public cascade;
      drop schema if exists app cascade;
      drop schema if exists drizzle cascade;
      drop type if exists member_role, legal_form, vat_regime, filing_frequency, record_status cascade;
      create schema public;
    `);
  } finally {
    await pool.end();
  }
  await runMigrations(url);
  await configureAppRole(url, TEST_APP_PASSWORD);
}
