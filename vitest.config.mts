import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { TEST_APP_PASSWORD, TEST_APP_URL, TEST_OWNER_URL } from "./tests/setup/env";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      "server-only": resolve(import.meta.dirname, "tests/stubs/empty.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/setup/global-db.ts"],
    // Los tests de base de datos comparten una BD: se ejecutan en serie.
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      MIGRATION_DATABASE_URL: TEST_OWNER_URL,
      DATABASE_URL: TEST_APP_URL,
      APP_DB_PASSWORD: TEST_APP_PASSWORD,
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-123",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
  },
});
