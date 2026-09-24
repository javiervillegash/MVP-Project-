import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttachForm } from "@/components/documents/attach-form";
import { formatSize } from "@/components/documents/document-list";
import { Badge, Card, Table, Td, Th } from "@/components/ui/primitives";
import { formatDate } from "@/lib/dates";
import { can } from "@/modules/access/context";
import { FOLDER_LABELS, listDocuments, type DocumentFolder } from "@/modules/documents/service";
import { requireAccess } from "@/modules/identity/session";
import { attachDocumentAction, setDocumentStatusAction } from "../facturas/actions";

export const metadata: Metadata = { title: "Documentos" };

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ carpeta?: string }>;
}) {
  const { id } = await params;
  const { carpeta } = await searchParams;
  const { access } = await requireAccess();
  if (!can(access, "document.view", id)) notFound();
  const folder = carpeta && carpeta in FOLDER_LABELS ? (carpeta as DocumentFolder) : undefined;
  const docs = await listDocuments(access, id, { folder });
  const base = `/sociedades/${id}/documentos`;
  const canArchive = can(access, "invoice.write", id);

  return (
    <div className="space-y-6">
      {can(access, "document.upload", id) && (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Subir documento</h2>
          <AttachForm action={attachDocumentAction.bind(null, id, null)} showFolder />
        </Card>
      )}
      <div className="flex flex-wrap gap-1">
        <FolderLink href={base} active={!folder} label="Todos" />
        {Object.entries(FOLDER_LABELS).map(([k, l]) => (
          <FolderLink key={k} href={`${base}?carpeta=${k}`} active={folder === k} label={l} />
        ))}
      </div>
      {docs.length === 0 ? (
        <p className="text-sm text-muted">No hay documentos en esta carpeta.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Archivo</Th>
              <Th>Carpeta</Th>
              <Th>Enlazado a</Th>
              <Th className="text-right">Tamaño</Th>
              <Th>Subido</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <Td>
                  <a
                    href={`/api/documentos/${d.id}`}
                    target="_blank"
                    rel="noopener"
                    className="font-medium hover:underline"
                  >
                    {d.fileName}
                  </a>
                </Td>
                <Td>{FOLDER_LABELS[d.folder]}</Td>
                <Td>
                  {d.links > 0 ? (
                    <Badge>{d.links === 1 ? "1 elemento" : `${d.links} elementos`}</Badge>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </Td>
                <Td className="num text-right">{formatSize(d.sizeBytes)}</Td>
                <Td className="num">{formatDate(d.createdAt.toISOString().slice(0, 10))}</Td>
                <Td className="text-right">
                  <a href={`/api/documentos/${d.id}?descargar=1`} className="mr-3 text-sm text-muted underline">
                    Descargar
                  </a>
                  {canArchive && (
                    <form action={setDocumentStatusAction.bind(null, id, d.id, "void")} className="inline">
                      <button type="submit" className="text-sm text-muted underline hover:text-danger">
                        Archivar
                      </button>
                    </form>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function FolderLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        "rounded-md px-3 py-1.5 text-sm " + (active ? "bg-surface-muted font-medium" : "text-muted hover:text-text")
      }
    >
      {label}
    </Link>
  );
}
