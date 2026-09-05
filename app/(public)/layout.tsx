import Link from "next/link";

const PUBLIC_LINKS = [
  { href: "/", label: "Home" },
  { href: "/software", label: "Software" },
  { href: "/categories", label: "Categories" },
] as const;

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="public-shell">
      <header className="public-header">
        <nav className="public-nav" aria-label="Primary navigation">
          <Link className="public-brand" href="/">
            SaaSElephant
          </Link>
          <ul>
            {PUBLIC_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      {children}
      <footer className="public-footer">
        <p>Find software that fits the way your business works.</p>
        <nav aria-label="Footer navigation">
          {PUBLIC_LINKS.map((link) => (
            <Link href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
