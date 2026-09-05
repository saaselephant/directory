import Image from "next/image";
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
            {/* Real Logo Asset with fixed layout boundaries */}
            <Image
              className="brand-logo-img"
              src="/SaasElephantLogoFinal.png"
              alt="SaaSElephant"
              width={160}
              height={44}
              style={{ objectFit: "contain", height: "auto" }}
              priority
            />
          </Link>
          <PublicNavigation />
        </nav>
      </header>

      <div id="public-content" tabIndex={-1}>
        {children}
      </div>

      <footer className="public-footer">
        <div className="footer-description">
          <Link className="public-brand" href="/" aria-label="SaaSElephant home">
            {/* Real Logo Asset preserved in footer */}
            <Image
              className="brand-logo-img"
              src="/SaasElephantLogoFinal.png"
              alt="SaaSElephant"
              width={140}
              height={38}
              style={{ objectFit: "contain", height: "auto" }}
            />
          </Link>
          <p>
            Discover software for your business.
            <br />
            Explore here. Buy directly from the vendor.
          </p>
          <p className="affiliate-disclosure">
            <strong>Affiliate Disclosure:</strong> SaaSElephant may earn a commission when you purchase software through certain links, at no additional cost to you.
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
