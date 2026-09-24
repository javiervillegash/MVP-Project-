import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { auditLog, legalEntities } from "@/db/schema";
import { DomainError } from "@/lib/errors";
import { AccessDeniedError, resolveAccess } from "@/modules/access/context";
import {
  archiveCompany,
  createCompany,
  createLegalEntity,
  getCompany,
  listCompanies,
  reactivateCompany,
  setLegalEntityStatus,
  updateCompany,
  updateLegalEntity,
  type LegalEntityInput,
} from "@/modules/tenancy/service";
import { createScenario, ownerDb } from "../helpers/db";

const owner = ownerDb();
let A: Awaited<ReturnType<typeof createScenario>>;
let B: Awaited<ReturnType<typeof createScenario>>;

beforeAll(async () => {
  A = await createScenario(owner.db, "SvcA");
  B = await createScenario(owner.db, "SvcB");
});
afterAll(async () => {
  await closeDb();
  await owner.pool.end();
});

const access = async (userId: string) => (await resolveAccess(userId))!;
const entity = (over: Partial<LegalEntityInput> = {}): LegalEntityInput => ({
  legalName: "Nueva Sociedad SL",
  taxId: "B11111119",
  legalForm: "sl",
  vatRegime: "general",
  vatFilingFrequency: "trimestral",
  fiscalYearStartMonth: 1,
  ...over,
});

describe("clientes", () => {
  it("el Administrador crea un cliente con paquete y gestor responsable", async () => {
    const admin = await access(A.users.admin);
    const id = await createCompany(admin, {
      name: "Cliente Nuevo",
      plan: "profesional",
      managerUserId: A.users.gestor,
    });
    const list = await listCompanies(admin);
    expect(list.find((c) => c.id === id)).toMatchObject({
      name: "Cliente Nuevo",
      plan: "profesional",
      managerName: `gestor SvcA`,
      entityCount: 0,
    });
  });

  it("Finance Department exige precio pactado", async () => {
    const admin = await access(A.users.admin);
    await expect(createCompany(admin, { name: "Grande", plan: "finance_department" })).rejects.toThrow(
      /precio pactado/,
    );
    const id = await createCompany(admin, {
      name: "Grande",
      plan: "finance_department",
      customMonthlyPriceCents: 250_000,
    });
    expect((await listCompanies(admin)).find((c) => c.id === id)?.customMonthlyPriceCents).toBe(250_000);
  });

  it("no acepta como gestor responsable a alguien que no es del equipo", async () => {
    const admin = await access(A.users.admin);
    await expect(
      createCompany(admin, { name: "Cliente X", plan: "esencial", managerUserId: A.users.director }),
    ).rejects.toThrow(DomainError);
  });

  it("un gestor no puede crear clientes", async () => {
    await expect(createCompany(await access(A.users.gestor), { name: "Cliente X", plan: "esencial" })).rejects.toThrow(
      AccessDeniedError,
    );
  });

  it("no puede modificar un cliente de otra organización", async () => {
    const admin = await access(A.users.admin);
    await expect(updateCompany(admin, B.companies.c1.id, { name: "Hack", plan: "empresa" })).rejects.toThrow(
      /no encontrado/,
    );
  });

  it("archivar un cliente archiva sus sociedades; reactivar no las reactiva solas", async () => {
    const admin = await access(A.users.admin);
    const id = await createCompany(admin, { name: "Temporal", plan: "esencial" });
    const e = await createLegalEntity(admin, id, entity({ legalName: "Temporal SL", taxId: "B22222228" }));
    await archiveCompany(admin, id);
    let detail = await getCompany(admin, id);
    expect(detail?.status).toBe("archived");
    expect(detail?.entities[0].status).toBe("archived");
    await expect(setLegalEntityStatus(admin, e, "active")).rejects.toThrow(/Reactiva antes el cliente/);
    await reactivateCompany(admin, id);
    await setLegalEntityStatus(admin, e, "active");
    detail = await getCompany(admin, id);
    expect(detail?.entities[0].status).toBe("active");
  });
});

describe("sociedades", () => {
  it("valida el NIF y lo normaliza", async () => {
    const admin = await access(A.users.admin);
    await expect(createLegalEntity(admin, A.companies.c1.id, entity({ taxId: "B11111110" }))).rejects.toThrow(
      /NIF no es válido/,
    );
    const id = await createLegalEntity(admin, A.companies.c1.id, entity({ taxId: " b-1111111.9 " }));
    const [row] = await owner.db.select().from(legalEntities).where(eq(legalEntities.id, id));
    expect(row.taxId).toBe("B11111119");
  });

  it("un autónomo necesita DNI/NIE y una sociedad un NIF de persona jurídica", async () => {
    const admin = await access(A.users.admin);
    await expect(
      createLegalEntity(admin, A.companies.c1.id, entity({ legalForm: "autonomo", taxId: "B33333337" })),
    ).rejects.toThrow(/DNI o NIE/);
    await expect(createLegalEntity(admin, A.companies.c1.id, entity({ taxId: "12345678Z" }))).rejects.toThrow(
      /persona jurídica/,
    );
  });

  it("no permite dos sociedades con el mismo NIF en la organización", async () => {
    const admin = await access(A.users.admin);
    await createLegalEntity(admin, A.companies.c2.id, entity({ taxId: "B44444446" }));
    await expect(createLegalEntity(admin, A.companies.c2.id, entity({ taxId: "B44444446" }))).rejects.toThrow(
      /Ya existe una sociedad con ese NIF/,
    );
  });

  it("el mismo NIF sí puede existir en otra organización", async () => {
    const adminB = await access(B.users.admin);
    await expect(createLegalEntity(adminB, B.companies.c1.id, entity({ taxId: "B44444446" }))).resolves.toBeTypeOf(
      "string",
    );
  });

  it("no se puede crear una sociedad en un cliente de otra organización", async () => {
    await expect(
      createLegalEntity(await access(A.users.admin), B.companies.c1.id, entity({ taxId: "B55555551" })),
    ).rejects.toThrow(/Cliente no encontrado/);
  });

  it("el gestor puede editar los datos de sus sociedades, no las de otros", async () => {
    const gestor = await access(A.users.gestor);
    await updateLegalEntity(gestor, A.entities.e1a.id, entity({ legalName: "Editada SL", taxId: "B66666660" }));
    await expect(
      updateLegalEntity(gestor, A.entities.e2.id, entity({ legalName: "No", taxId: "B77777779" })),
    ).rejects.toThrow(AccessDeniedError);
  });

  it("cada alta queda auditada con su autor", async () => {
    const admin = await access(A.users.admin);
    const id = await createLegalEntity(admin, A.companies.c1.id, entity({ taxId: "B88888888" }));
    const rows = await owner.db.select().from(auditLog).where(eq(auditLog.recordId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "INSERT", actorUserId: A.users.admin });
  });
});
