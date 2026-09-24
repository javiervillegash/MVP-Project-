/**
 * Documentos: subida, enlace a facturas/apuntes/terceros y descarga segura.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { documentLinks, documents } from "@/db/schema";
import { withDbContext } from "@/db/tenant";
import { DomainError } from "@/lib/errors";
import { detectContentType, getStorage, MAX_UPLOAD_BYTES, safeFileName, sha256 } from "@/lib/storage";
import { assertCan, toDbContext, type AccessContext } from "@/modules/access/context";
import { assertActiveEntity } from "@/modules/accounting/categories";

export type DocumentFolder = "facturas" | "contratos" | "bancos" | "gestoria" | "otros";
export type DocumentTarget = "invoice" | "manual_entry" | "counterparty";

export const FOLDER_LABELS: Record<DocumentFolder, string> = {
  facturas: "Facturas",
  contratos: "Contratos",
  bancos: "Bancos",
  gestoria: "Gestoría",
  otros: "Otros",
};

export interface UploadedFile {
  name: string;
  data: Buffer;
}

/** Valida un archivo antes de guardarlo. Devuelve su tipo real y huella. */
export function inspectFile(file: UploadedFile) {
  if (file.data.length === 0) throw new DomainError("El archivo está vacío", "file");
  if (file.data.length > MAX_UPLOAD_BYTES) throw new DomainError("El archivo supera 15 MB", "file");
  const contentType = detectContentType(file.data);
  if (!contentType)
    throw new DomainError("Formato no admitido: sube un PDF, una imagen (JPG, PNG, WEBP) o un XML", "file");
  return { contentType, sha256: sha256(file.data), fileName: safeFileName(file.name) };
}

/**
 * Guarda un documento dentro de una transacción ya abierta (para poder
 * crear, p. ej., una factura y su PDF de una sola vez). Si el mismo archivo
 * ya existía en la sociedad, lo reutiliza en lugar de duplicarlo.
 */
export async function storeDocument(
  tx: Tx,
  ctx: { orgId: string; userId: string },
  legalEntityId: string,
  file: UploadedFile,
  folder: DocumentFolder,
  link?: { type: DocumentTarget; id: string },
): Promise<{ id: string; reused: boolean }> {
  const info = inspectFile(file);
  const [existing] = await tx
    .select({ id: documents.id, status: documents.status })
    .from(documents)
    .where(and(eq(documents.legalEntityId, legalEntityId), eq(documents.sha256, info.sha256)));

  let id = existing?.id;
  if (existing && existing.status !== "active") {
    await tx.update(documents).set({ status: "active" }).where(eq(documents.id, existing.id));
  }
  if (!id) {
    id = crypto.randomUUID();
    const storageKey = `${ctx.orgId}/${legalEntityId}/${id}`;
    await getStorage().put(storageKey, file.data);
    await tx.insert(documents).values({
      id,
      organizationId: ctx.orgId,
      legalEntityId,
      fileName: info.fileName,
      contentType: info.contentType,
      sizeBytes: file.data.length,
      sha256: info.sha256,
      storageKey,
      folder,
      uploadedBy: ctx.userId,
    });
  }
  if (link) {
    await tx
      .insert(documentLinks)
      .values({ organizationId: ctx.orgId, legalEntityId, documentId: id, targetType: link.type, targetId: link.id })
      .onConflictDoNothing();
  }
  return { id, reused: !!existing };
}

export async function uploadDocument(
  access: AccessContext,
  legalEntityId: string,
  file: UploadedFile,
  folder: DocumentFolder,
  link?: { type: DocumentTarget; id: string },
) {
  assertCan(access, "document.upload", legalEntityId);
  return withDbContext(toDbContext(access), async (tx) => {
    await assertActiveEntity(tx, legalEntityId);
    return storeDocument(tx, access, legalEntityId, file, folder, link);
  });
}

export async function unlinkDocument(
  access: AccessContext,
  legalEntityId: string,
  documentId: string,
  target: { type: DocumentTarget; id: string },
) {
  assertCan(access, "invoice.write", legalEntityId);
  await withDbContext(toDbContext(access), (tx) =>
    tx
      .delete(documentLinks)
      .where(
        and(
          eq(documentLinks.legalEntityId, legalEntityId),
          eq(documentLinks.documentId, documentId),
          eq(documentLinks.targetType, target.type),
          eq(documentLinks.targetId, target.id),
        ),
      ),
  );
}

export async function setDocumentStatus(
  access: AccessContext,
  legalEntityId: string,
  documentId: string,
  status: "active" | "void",
) {
  assertCan(access, "invoice.write", legalEntityId);
  await withDbContext(toDbContext(access), async (tx) => {
    const updated = await tx
      .update(documents)
      .set({ status })
      .where(and(eq(documents.id, documentId), eq(documents.legalEntityId, legalEntityId)))
      .returning({ id: documents.id });
    if (updated.length === 0) throw new DomainError("Documento no encontrado");
  });
}

export async function listDocuments(
  access: AccessContext,
  legalEntityId: string,
  opts: { folder?: DocumentFolder; includeVoid?: boolean } = {},
) {
  assertCan(access, "document.view", legalEntityId);
  return withDbContext(toDbContext(access), (tx) =>
    tx
      .select({
        id: documents.id,
        fileName: documents.fileName,
        contentType: documents.contentType,
        sizeBytes: documents.sizeBytes,
        folder: documents.folder,
        status: documents.status,
        createdAt: documents.createdAt,
        links: sql<number>`(select count(*)::int from document_links dl where dl.document_id = ${documents.id})`,
      })
      .from(documents)
      .where(
        and(
          eq(documents.legalEntityId, legalEntityId),
          opts.folder ? eq(documents.folder, opts.folder) : undefined,
          opts.includeVoid ? undefined : eq(documents.status, "active"),
        ),
      )
      .orderBy(desc(documents.createdAt))
      .limit(500),
  );
}

export async function listDocumentsFor(
  access: AccessContext,
  legalEntityId: string,
  target: { type: DocumentTarget; id: string },
) {
  assertCan(access, "document.view", legalEntityId);
  return withDbContext(toDbContext(access), (tx) =>
    tx
      .select({
        id: documents.id,
        fileName: documents.fileName,
        contentType: documents.contentType,
        sizeBytes: documents.sizeBytes,
        createdAt: documents.createdAt,
      })
      .from(documentLinks)
      .innerJoin(documents, eq(documents.id, documentLinks.documentId))
      .where(
        and(
          eq(documentLinks.legalEntityId, legalEntityId),
          eq(documentLinks.targetType, target.type),
          eq(documentLinks.targetId, target.id),
          eq(documents.status, "active"),
        ),
      )
      .orderBy(desc(documents.createdAt)),
  );
}

/** Nº de documentos por elemento, para mostrar un clip en los listados. */
export async function countDocumentsFor(
  tx: Tx,
  legalEntityId: string,
  type: DocumentTarget,
  ids: string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({ targetId: documentLinks.targetId, n: sql<number>`count(*)::int` })
    .from(documentLinks)
    .innerJoin(documents, eq(documents.id, documentLinks.documentId))
    .where(
      and(
        eq(documentLinks.legalEntityId, legalEntityId),
        eq(documentLinks.targetType, type),
        inArray(documentLinks.targetId, ids),
        eq(documents.status, "active"),
      ),
    )
    .groupBy(documentLinks.targetId);
  return new Map(rows.map((r) => [r.targetId, r.n]));
}

/**
 * Descarga: busca el documento a través de RLS (si no es visible, no existe)
 * y comprueba además el permiso de ver documentos en su sociedad.
 */
export async function readDocument(access: AccessContext, documentId: string) {
  const [doc] = await withDbContext(toDbContext(access), (tx) =>
    tx.select().from(documents).where(eq(documents.id, documentId)),
  );
  if (!doc) return null;
  assertCan(access, "document.view", doc.legalEntityId);
  const data = await getStorage().get(doc.storageKey);
  if (sha256(data) !== doc.sha256) throw new Error(`Integridad del documento ${doc.id} comprometida`);
  return { fileName: doc.fileName, contentType: doc.contentType, data };
}
