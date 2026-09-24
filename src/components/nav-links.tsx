"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 md:flex-col" aria-label="Principal">
      {items.map((i) => {
        const active = i.href === "/" ? pathname === "/" : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={
              "whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-surface-muted " +
              (active ? "bg-surface-muted font-medium text-text" : "text-muted hover:text-text")
            }
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
