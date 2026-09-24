"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Pestañas de navegación. `exact` marca la pestaña raíz. */
export function Tabs({ items }: { items: { href: string; label: string; exact?: boolean }[] }) {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border" aria-label="Secciones">
      {items.map((i) => {
        const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm " +
              (active ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text")
            }
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
