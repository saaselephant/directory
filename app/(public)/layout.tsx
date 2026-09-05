import { PublicNavigation } from "./public-navigation";
import Link from "next/link";
const PUBLIC_LINKS = [
  { href: "/", label: "Home" },
  { href: "/software", label: "Software" },
  { href: "/categories", label: "Categories" },
] as const;
export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="public-shell">
      <a className="skip-link" href="#public-content">
        Skip to content
      </a>
      <header className="public-header">
        <nav className="public-nav" aria-label="Primary navigation">
          <Link className="public-brand" href="/" aria-label="SaaSElephant home">
            <span className="brand-mark" aria-hidden="true">
              SE
            </span>
            SaaSElephant
          </Link>
          <PublicNavigation />
        </nav>
      </header>
      <div id="public-content" tabIndex={-1}>
        {children}
      </div>
      <footer className="public-footer">
        <div className="footer-description">
          <Link className="public-brand" href="/">
            SaaSElephant
          </Link>
          <p>
            Discover software for your business.
            <br />
            Explore here. Buy directly from the vendor.
          </p>
          <p className="affiliate-disclosure">
            SaaSElephant may earn a commission when you purchase software through certain links, at
            no additional cost to you.
          </p>
          <small>© {new Date().getFullYear()} SaaSElephant</small>
        </div>
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
