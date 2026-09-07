import Image from "next/image";
import "./marketplace.css";
import {
  PublicNavigation,
  type CategorySoftwarePreview,
} from "./public-navigation";
import Link from "next/link";
import {
  listPublicCategories,
  listPublishedSoftwareByCategorySlug,
} from "@/lib/repositories/categories";

export default async function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const categoryResult = await listPublicCategories();
  const categories = categoryResult.status === "success" ? categoryResult.categories : [];
  const categorySoftware = Object.fromEntries(
    await Promise.all(
      categories.slice(0, 4).map(async (category) => {
        const result = await listPublishedSoftwareByCategorySlug(
          category.slug,
          undefined,
          { page: 1, pageSize: 5 },
        );
        const preview: CategorySoftwarePreview[] =
          result.status === "success"
            ? result.items.map(({ name, slug }) => ({ name, slug }))
            : [];
        return [category.slug, preview] as const;
      }),
    ),
  );

  return (
    <div className="public-shell">
      <a className="skip-link" href="#public-content">
        Skip to content
      </a>

      <header className="public-header">
        <nav className="public-nav" aria-label="Primary navigation">
          <Link className="public-brand brand-lockup" href="/" aria-label="SaaSElephant home">
            {/* Approved production artwork: preserve the full image and original proportions. */}
            <span className="header-logo-crop">
              <Image
                className="brand-logo-img header-logo-img"
                src="/SaaSElephantLogo2026.png"
                alt="SaaSElephant"
                width={1983}
                height={793}
                style={{ objectFit: "contain" }}
                sizes="(max-width: 576px) 160px, 185px"
                priority
              />
            </span>
            <span className="brand-tagline">Your Elephant-Sized Store of Software</span>
          </Link>
          <PublicNavigation categories={categories} categorySoftware={categorySoftware} />
        </nav>
      </header>

      <div id="public-content" tabIndex={-1}>
        {children}
      </div>

      <footer className="public-footer">
        <div className="footer-description">
          <div className="footer-left">
            <Link className="public-brand" href="/" aria-label="SaaSElephant home">
              {/* Same approved artwork, without an additional visual wordmark. */}
              <Image
                className="brand-logo-img footer-logo-img"
                sizes="200px"
                src="/SaaSElephantLogo2026.png"
                alt="SaaSElephant"
                width={1983}
                height={793}
                style={{ objectFit: "contain" }}
              />
            </Link>
            <p className="affiliate-disclosure">
              <strong>Affiliate Disclosure:</strong> We may earn a commission when you purchase
              software through certain links, at no additional cost to you.
            </p>
          </div>
          <div className="footer-meta">
            <small>© 2026 SaaSElephant. All rights reserved.</small>
            <small>Powered by Pralka Tech AI.</small>
          </div>
        </div>
      </footer>
    </div>
  );
}
