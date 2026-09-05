"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function PublicNavigation() {
  const pathname = usePathname();
  return (
    <ul>
      {[
        { href: "/", label: "Home" },
        { href: "/software", label: "Software" },
        { href: "/categories", label: "Categories" },
      ].map(({ href, label }) => (
        <li key={href}>
          <Link
            href={href}
            aria-current={
              pathname === href || (href !== "/" && pathname?.startsWith(href + "/"))
                ? "page"
                : undefined
            }
          >
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
