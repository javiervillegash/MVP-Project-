import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge, buttonClass, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { can } from "@/modules/access/context";
import { describeGrant } from "@/modules/access/labels";
import { STAFF_ROLES } from "@/modules/access/permissions";
import { listMembers } from "@/modules/identity/members";
import { requireAccess } from "@/modules/identity/session";

export const metadata: Metadata = { title: "Usuarios" };

export default async function UsersPage() {
  const { access } = await requireAccess();
  if (!can(access, "org.users.manage")) notFound();
  const members = await listMembers(access);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Usuarios"
        subtitle={`${members.length} personas con acceso a ${access.orgName}`}
        actions={
          <Link href="/usuarios/nuevo" className={buttonClass()}>
            Invitar usuario
          </Link>
        }
      />
      <Table>
        <thead>
          <tr>
            <Th>Persona</Th>
            <Th>Accesos</Th>
            <Th>2FA</Th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const staff = m.grants.some((g) => STAFF_ROLES.includes(g.role));
            return (
              <tr key={m.userId}>
                <Td>
                  <Link href={`/usuarios/${m.userId}`} className="font-medium hover:underline">
                    {m.name}
                  </Link>
                  <div className="text-xs text-muted">{m.email}</div>
                </Td>
                <Td>
                  <ul className="space-y-1">
                    {m.grants.map((g) => (
                      <li key={g.membershipId}>{describeGrant(g)}</li>
                    ))}
                  </ul>
                </Td>
                <Td>
                  {m.twoFactorEnabled ? (
                    <Badge tone="accent">Activo</Badge>
                  ) : staff ? (
                    <Badge>Pendiente (obligatorio)</Badge>
                  ) : (
                    <Badge tone="muted">No</Badge>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
