import { formatDate } from "@/lib/dates";

export interface DocItem {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB`;
}

/** Lista de documentos con enlaces de ver/descargar y una acción opcional por fila. */
export function DocumentList({ docs, action }: { docs: DocItem[]; action?: (doc: DocItem) => React.ReactNode }) {
  if (docs.length === 0) return <p className="text-sm text-muted">Sin documentos.</p>;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {docs.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
          <a
            href={`/api/documentos/${d.id}`}
            target="_blank"
            rel="noopener"
            className="min-w-0 truncate font-medium hover:underline"
          >
            {d.fileName}
          </a>
          <span className="flex items-center gap-3 text-xs text-muted">
            <span className="num">
              {formatSize(d.sizeBytes)} · {formatDate(d.createdAt.toISOString().slice(0, 10))}
            </span>
            <a href={`/api/documentos/${d.id}?descargar=1`} className="underline">
              Descargar
            </a>
            {action?.(d)}
          </span>
        </li>
      ))}
    </ul>
  );
}
