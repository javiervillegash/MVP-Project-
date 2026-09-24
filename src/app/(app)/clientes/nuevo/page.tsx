import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CompanyForm } from "@/components/forms/company-form";
import { PageHeader } from "@/components/ui/primitives";
import { can } from "@/modules/access/context";
import { requireAccess } from "@/modules/identity/session";
import { listStaff } from "@/modules/tenancy/service";
import { createCompanyAction } from "../actions";

export const metadata: Metadata = { title: "Nuevo cliente" };

export default async function NewCompanyPage() {
  const { access } = await requireAccess();
  if (!can(access, "company.create")) notFound();
  const staff = await listStaff(access);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Nuevo cliente"
        subtitle="Después podrás añadir sus sociedades y dar acceso a su equipo."
        back={<Link href="/clientes">← Clientes</Link>}
      />
      <CompanyForm action={createCompanyAction} staff={staff} submitLabel="Crear cliente" />
    </div>
  );
}
