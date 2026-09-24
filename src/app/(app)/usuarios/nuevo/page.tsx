import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { InviteForm } from "@/components/forms/invite-form";
import { PageHeader } from "@/components/ui/primitives";
import { can } from "@/modules/access/context";
import { listScopeOptions } from "@/modules/identity/members";
import { requireAccess } from "@/modules/identity/session";
import { inviteAction } from "../actions";

export const metadata: Metadata = { title: "Invitar usuario" };

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { access } = await requireAccess();
  if (!can(access, "org.users.manage")) notFound();
  const { cliente } = await searchParams;
  const options = await listScopeOptions(access);
  const defaultScope = cliente && options.some((o) => o.id === cliente) ? `company:${cliente}` : undefined;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Invitar usuario"
        subtitle="Si la persona no tiene cuenta, se crea con una contraseña temporal que verás una sola vez."
        back={<Link href="/usuarios">← Usuarios</Link>}
      />
      {options.length === 0 ? (
        <p className="text-sm text-muted">
          Primero da de alta un cliente en{" "}
          <Link href="/clientes" className="underline">
            Clientes
          </Link>
          . Solo puedes invitar Administradores mientras no haya clientes.
        </p>
      ) : null}
      <InviteForm action={inviteAction} options={options} defaultScope={defaultScope} />
    </div>
  );
}
