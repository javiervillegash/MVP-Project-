/**
 * Alta inicial en un entorno nuevo: crea la organización (vuestra firma) y su
 * primer Administrador. Se ejecuta una vez, con el usuario propietario.
 *
 *   npm run bootstrap -- --org "Mi Firma SL" --email admin@mifirma.es --name "Nombre"
 *
 * La contraseña se genera y se muestra una sola vez; el Administrador deberá
 * activar 2FA al entrar por primera vez.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { parseArgs } from "node:util";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { createCredentialUser, generatePassword } from "../src/modules/identity/users";

async function main() {
  const { values } = parseArgs({
    options: {
      org: { type: "string" },
      "org-nif": { type: "string" },
      email: { type: "string" },
      name: { type: "string" },
    },
  });
  if (!values.org || !values.email || !values.name) {
    throw new Error('Uso: npm run bootstrap -- --org "Firma" --email a@b.es --name "Nombre"');
  }

  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL, max: 1 });
  const db = drizzle(pool, { schema });
  const password = generatePassword();

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.system_actor', 'bootstrap', true)`);
      const [org] = await tx
        .insert(schema.organizations)
        .values({ name: values.org!, taxId: values["org-nif"] })
        .returning();
      const userId = await createCredentialUser(tx, {
        email: values.email!,
        name: values.name!,
        password,
        mustChangePassword: true,
      });
      await tx.insert(schema.memberships).values({ organizationId: org.id, userId, role: "org_admin" });
      return { orgId: org.id, userId };
    });

    console.log("Organización creada:", result.orgId);
    console.log("Administrador:", values.email);
    console.log("Contraseña temporal (se muestra solo ahora):", password);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
