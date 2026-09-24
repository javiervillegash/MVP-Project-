import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Las migraciones se ejecutan con el usuario propietario (MIGRATION_DATABASE_URL),
// nunca con el usuario de la aplicación, que no puede saltarse RLS.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: process.env.MIGRATION_DATABASE_URL! },
  strict: true,
  verbose: true,
});
