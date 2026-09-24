import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GrantForm } from "@/components/forms/grant-form";
import { RevokeButton } from "@/components/forms/revoke-button";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { can } from "@/modules/access/context";
import { describeGrant } from "@/modules/access/labels";
import { getMember, listScopeOptions } from "@/modules/identity/members";
import { requireAccess } from "@/modules/identity/session";
import { addGrantAction, revokeGrantAction } from "../actions";

export const metadata: Metadata = { title: "Usuario" };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await requireAccess();
  if (!can(access, "org.users.manage")) notFound();
  const [member, options] = await Promise.all([getMember(access, id), listScopeOptions(access)]);
  if (!member) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <PageHeader
        title={member.name}
        subtitle={
          <>
            {member.email} · 2FA{" "}
            {member.twoFactorEnabled ? <Badge tone="accent">Activo</Badge> : <Badge tone="muted">No</Badge>}
          </>
        }
        back={<Link href="/usuarios">← Usuarios</Link>}
      />
      <section>
        <h2 className="mb-3 text-lg font-semibold">Accesos</h2>
        <Card className="divide-y divide-border">
          {member.grants.map((g) => (
            <div key={g.membershipId} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
              <span>{describeGrant(g)}</span>
              <RevokeButton action={revokeGrantAction.bind(null, g.membershipId, member.userId)} />
            </div>
          ))}
        </Card>
        <p className="mt-2 text-xs text-muted">
          Al retirar el último acceso, la persona conserva su cuenta pero deja de ver cualquier dato de la organización.
        </p>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Añadir acceso</h2>
        <GrantForm action={addGrantAction.bind(null, member.userId)} options={options} />
      </section>
    </div>
  );
}
