/**
 * Datos de DEMOSTRACIÓN para desarrollo local. Nunca en producción.
 *
 *   npm run db:seed
 *
 * Crea una firma con 2 clientes y 3 sociedades, y cuatro usuarios (uno por
 * rol) con la contraseña DEMO_PASSWORD. Todos los NIF son ficticios pero
 * válidos en su dígito de control.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { applyCategoryTemplate } from "../src/modules/accounting/categories";
import { createCredentialUser } from "../src/modules/identity/users";
import { computeTotals, type LineInput } from "../src/modules/invoicing/calc";

export const DEMO_PASSWORD = "demo-password-2026";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("El seed de demo no se ejecuta en producción");
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL, max: 1 });
  const db = drizzle(pool, { schema });

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.system_actor', 'seed-dev', true)`);

      const [org] = await tx
        .insert(schema.organizations)
        .values({ name: "Firma Demo Administración", taxId: "B12345674" })
        .returning();

      const [alfa, beta] = await tx
        .insert(schema.companies)
        .values([
          { organizationId: org.id, name: "Grupo Alfa" },
          { organizationId: org.id, name: "Juan Pérez (autónomo)" },
        ])
        .returning();

      const entities = await tx
        .insert(schema.legalEntities)
        .values([
          {
            organizationId: org.id,
            companyId: alfa.id,
            legalName: "Alfa Servicios SL",
            taxId: "B87654323",
            legalForm: "sl",
          },
          {
            organizationId: org.id,
            companyId: alfa.id,
            legalName: "Alfa Inmuebles SL",
            taxId: "B11111119",
            legalForm: "sl",
          },
          {
            organizationId: org.id,
            companyId: beta.id,
            legalName: "Juan Pérez García",
            taxId: "12345678Z",
            legalForm: "autonomo",
          },
        ])
        .returning();
      const [alfaSl] = entities;

      // Plantilla de categorías PGC en cada sociedad.
      for (const e of entities) await applyCategoryTemplate(tx, org.id, e.id);

      // Algunos clientes y proveedores de ejemplo en Alfa Servicios SL.
      const cat = async (key: string) =>
        (
          await tx
            .select({ id: schema.categories.id })
            .from(schema.categories)
            .where(sql`legal_entity_id = ${alfaSl.id} and template_key = ${key}`)
        )[0]?.id;
      const parties = await tx
        .insert(schema.counterparties)
        .values([
          {
            organizationId: org.id,
            legalEntityId: alfaSl.id,
            name: "Endesa Energía SAU",
            taxId: "A81948077",
            isSupplier: true,
            paymentTermsDays: 15,
            defaultExpenseCategoryId: await cat("suministros.electricidad"),
          },
          {
            organizationId: org.id,
            legalEntityId: alfaSl.id,
            name: "Inmobiliaria Centro SL",
            taxId: "B22222228",
            isSupplier: true,
            paymentTermsDays: 5,
            defaultExpenseCategoryId: await cat("alquiler"),
          },
          {
            organizationId: org.id,
            legalEntityId: alfaSl.id,
            name: "Construcciones Norte SA",
            taxId: "A58818501",
            isCustomer: true,
            paymentTermsDays: 60,
            iban: "ES9121000418450200051332",
            defaultIncomeCategoryId: await cat("ventas.servicios"),
          },
          {
            organizationId: org.id,
            legalEntityId: alfaSl.id,
            name: "Hostelería Sur SL",
            taxId: "B33333337",
            isCustomer: true,
            isSupplier: true,
            paymentTermsDays: 30,
          },
        ])
        .returning();
      const [endesa, inmobiliaria, norte] = parties;

      // Facturas de ejemplo (septiembre 2026).
      const addInvoice = async (
        direction: "issued" | "received",
        counterpartyId: string,
        number: string,
        issueDate: string,
        dueDate: string,
        lines: (LineInput & { description: string; categoryKey: string })[],
      ) => {
        const t = computeTotals(lines);
        const [inv] = await tx
          .insert(schema.invoices)
          .values({
            organizationId: org.id,
            legalEntityId: alfaSl.id,
            direction,
            counterpartyId,
            series: direction === "issued" ? "F" : null,
            number,
            issueDate,
            dueDate,
            baseCents: t.baseCents,
            vatCents: t.vatCents,
            surchargeCents: t.surchargeCents,
            withholdingCents: t.withholdingCents,
            totalCents: t.totalCents,
          })
          .returning();
        for (const [i, l] of lines.entries()) {
          await tx.insert(schema.invoiceLines).values({
            organizationId: org.id,
            legalEntityId: alfaSl.id,
            invoiceId: inv.id,
            position: i + 1,
            description: l.description,
            quantityMilli: l.quantityMilli,
            unitPriceCents: l.unitPriceCents,
            baseCents: t.lineBases[i],
            vatRateBp: l.vatRateBp,
            surchargeRateBp: l.surchargeRateBp ?? 0,
            withholdingRateBp: l.withholdingRateBp ?? 0,
            categoryId: await cat(l.categoryKey),
          });
        }
      };
      await addInvoice("issued", norte.id, "2026-014", "2026-09-02", "2026-11-01", [
        {
          description: "Dirección de obra – septiembre",
          quantityMilli: 1000,
          unitPriceCents: 450000,
          vatRateBp: 2100,
          categoryKey: "ventas.servicios",
        },
      ]);
      await addInvoice("issued", norte.id, "2026-011", "2026-07-15", "2026-08-14", [
        {
          description: "Estudio de viabilidad",
          quantityMilli: 1000,
          unitPriceCents: 180000,
          vatRateBp: 2100,
          categoryKey: "ventas.servicios",
        },
      ]);
      await addInvoice("received", endesa.id, "PMS601N0012345", "2026-09-05", "2026-09-20", [
        {
          description: "Electricidad agosto",
          quantityMilli: 1000,
          unitPriceCents: 21430,
          vatRateBp: 2100,
          categoryKey: "suministros.electricidad",
        },
      ]);
      await addInvoice("received", inmobiliaria.id, "A-0926", "2026-09-01", "2026-09-05", [
        {
          description: "Alquiler oficina septiembre",
          quantityMilli: 1000,
          unitPriceCents: 120000,
          vatRateBp: 2100,
          withholdingRateBp: 1900,
          categoryKey: "alquiler",
        },
      ]);
      await tx.insert(schema.manualEntries).values({
        organizationId: org.id,
        legalEntityId: alfaSl.id,
        kind: "expense",
        entryDate: "2026-09-10",
        description: "Comisión mantenimiento cuenta",
        categoryId: (await cat("otros.bancarios"))!,
        amountCents: 1500,
        paymentMethod: "direct_debit",
      });

      const users = {
        admin: await createCredentialUser(tx, {
          email: "admin@demo.local",
          name: "Ana Administradora",
          password: DEMO_PASSWORD,
        }),
        gestor: await createCredentialUser(tx, {
          email: "gestor@demo.local",
          name: "Gonzalo Gestor",
          password: DEMO_PASSWORD,
        }),
        director: await createCredentialUser(tx, {
          email: "director@alfa.local",
          name: "Diana Directora",
          password: DEMO_PASSWORD,
        }),
        gestoria: await createCredentialUser(tx, {
          email: "gestoria@asesores.local",
          name: "Asesores Demo",
          password: DEMO_PASSWORD,
        }),
      };

      await tx.insert(schema.memberships).values([
        { organizationId: org.id, userId: users.admin, role: "org_admin" },
        // El gestor lleva el Grupo Alfa completo (sus dos sociedades).
        { organizationId: org.id, userId: users.gestor, role: "gestor", companyId: alfa.id },
        // La directora del grupo ve sus dos sociedades.
        { organizationId: org.id, userId: users.director, role: "client_director", companyId: alfa.id },
        // La gestoría solo tiene asignada una sociedad.
        { organizationId: org.id, userId: users.gestoria, role: "gestoria", legalEntityId: alfaSl.id },
      ]);

      await tx
        .update(schema.companies)
        .set({ managerUserId: users.gestor })
        .where(sql`id = ${alfa.id}`);
    });

    console.log("Datos de demostración creados. Contraseña de todos los usuarios:", DEMO_PASSWORD);
    console.log("  admin@demo.local · gestor@demo.local · director@alfa.local · gestoria@asesores.local");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
