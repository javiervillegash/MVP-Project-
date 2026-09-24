import "dotenv/config";

/**
 * URLs de la base de datos de test (sobrescribibles por variables de entorno en CI).
 *
 * Ojo: en PostgreSQL los roles son de todo el servidor, no de cada base de
 * datos. Por eso el test reutiliza APP_DB_PASSWORD de tu .env: si usara otra,
 * cambiaría la contraseña de finanzas_app también para tu BD de desarrollo.
 */
export const TEST_OWNER_URL =
  process.env.TEST_MIGRATION_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/finanzas_test";
export const TEST_APP_PASSWORD =
  process.env.TEST_APP_DB_PASSWORD ?? process.env.APP_DB_PASSWORD ?? "test-app-password-123";
export const TEST_APP_URL = TEST_OWNER_URL.replace(/\/\/[^@]+@/, `//finanzas_app:${TEST_APP_PASSWORD}@`);
