import { Badge } from "@/components/ui/primitives";
import type { DerivedStatus } from "@/modules/invoicing/invoices";

const LABELS: Record<DerivedStatus, string> = {
  pending: "Pendiente",
  overdue: "Vencida",
  uncollectible: "Incobrable",
  void: "Anulada",
};

export function InvoiceStatusBadge({ status }: { status: DerivedStatus }) {
  if (status === "overdue")
    return (
      <span className="inline-flex rounded bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">Vencida</span>
    );
  return <Badge tone={status === "pending" ? "neutral" : "muted"}>{LABELS[status]}</Badge>;
}

/** Icono de clip (documento adjunto). */
export function PaperclipIcon({ title = "Con documento adjunto" }: { title?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="13"
      height="13"
      className="ml-1 inline align-[-2px] text-muted"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <path
        d="M10.5 4.5 5.8 9.2a1.2 1.2 0 0 0 1.7 1.7l5-5a2.5 2.5 0 0 0-3.5-3.5l-5 5a3.8 3.8 0 0 0 5.3 5.3l4.2-4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
