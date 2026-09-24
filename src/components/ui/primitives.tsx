import type React from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <button
      className={cx(
        "inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50",
        variant === "primary" && "bg-accent text-accent-contrast hover:opacity-90",
        variant === "secondary" && "border border-border bg-surface hover:bg-surface-muted",
        variant === "ghost" && "text-muted hover:bg-surface-muted hover:text-text",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm",
        "focus:outline-2 focus:outline-offset-0 focus:outline-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className="mb-1 block text-sm font-medium" {...props} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-lg border border-border bg-surface", className)}>{children}</div>;
}

export function Alert({ tone = "danger", children }: { tone?: "danger" | "success"; children: ReactNode }) {
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={cx(
        "rounded-md border px-3 py-2 text-sm",
        tone === "danger" && "border-danger/40 text-danger",
        tone === "success" && "border-success/40 text-success",
      )}
    >
      {children}
    </p>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-sm font-semibold tracking-wide text-accent">PLATAFORMA FINANCIERA</p>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <Card className="mt-6 p-6">{children}</Card>
      </div>
    </main>
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm",
        "focus:outline-2 focus:outline-offset-0 focus:outline-accent",
        className,
      )}
      {...props}
    />
  );
}

/** Campo de formulario con etiqueta, ayuda y error. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {back && <div className="mb-2 text-sm text-muted">{back}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "muted" | "accent"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-surface-muted text-text",
        tone === "muted" && "bg-surface-muted text-muted",
        tone === "accent" && "bg-accent/10 text-accent",
      )}
    >
      {children}
    </span>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </Card>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cx(
        "border-b border-border px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("border-b border-border px-4 py-3 align-top", className)}>{children}</td>;
}

/** Enlace con aspecto de botón. */
export function buttonClass(variant: "primary" | "secondary" = "primary") {
  return cx(
    "inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors",
    variant === "primary" && "bg-accent text-accent-contrast hover:opacity-90",
    variant === "secondary" && "border border-border bg-surface hover:bg-surface-muted",
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        "min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm",
        "focus:outline-2 focus:outline-offset-0 focus:outline-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-[var(--accent)]" {...props} />
      {label}
    </label>
  );
}
