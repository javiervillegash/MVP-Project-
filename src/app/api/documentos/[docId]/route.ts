import { isUuid } from "@/lib/ids";
import { getCurrent } from "@/modules/identity/session";
import { readDocument } from "@/modules/documents/service";

export const dynamic = "force-dynamic";

/**
 * Descarga de un documento. Exige sesión, pasa por RLS y por el permiso de
 * ver documentos de su sociedad. Nunca se sirve un archivo por su ruta.
 */
export async function GET(request: Request, { params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const current = await getCurrent();
  if (
    !current?.access ||
    (current.access.requiresTwoFactor && !current.user.twoFactorEnabled) ||
    current.user.mustChangePassword
  ) {
    return new Response("No autorizado", { status: 401 });
  }
  if (!isUuid(docId)) return new Response("No encontrado", { status: 404 });
  let file;
  try {
    file = await readDocument(current.access, docId);
  } catch (e) {
    if ((e as Error).name === "AccessDeniedError") return new Response("No encontrado", { status: 404 });
    throw e;
  }
  if (!file) return new Response("No encontrado", { status: 404 });

  const download = new URL(request.url).searchParams.get("descargar") === "1";
  const inline = !download && file.contentType !== "application/xml";
  const encoded = encodeURIComponent(file.fileName);
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.data.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encoded}`,
      "Cache-Control": "private, no-store",
      // Solo se sirven PDF e imágenes (el XML siempre como descarga) y el
      // navegador no puede reinterpretarlos como otra cosa.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
