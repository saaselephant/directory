import Link from "next/link";
import { Breadcrumbs, DiscoveryNext, MarketplaceGlyph, safeReturnPath } from "../../discovery";
import { SoftwareCatalog } from "../software-catalog";
import type { SoftwareCatalogItem } from "@/types/models";
import type { Metadata } from "next";
import type { PublishedSoftwareDetailResult } from "@/lib/repositories/software";
import type { PublicCategoriesResult } from "@/lib/repositories/categories";
import { safeReviewUrl } from "@/lib/security/review-url";
import { SoftwareLogo } from "../software-logo";

interface SoftwareDetailProps {
  result: Exclude<PublishedSoftwareDetailResult, { status: "not_found" }>;
  categories?: PublicCategoriesResult;
  returnTo?: string;
  related?: SoftwareCatalogItem[];
}

export function buildSoftwareMetadata(item: SoftwareCatalogItem): Metadata {
  return { title: item.name, description: item.description };
}

export function SoftwareDetail({
  result,
  categories,
  returnTo,
  related = [],
}: SoftwareDetailProps) {
  if (result.status === "error")
    return (
      <main className="software-detail-page">
        <section className="catalog-state">
          <h1>We couldn&apos;t load this software page.</h1>
          <p>Please try again shortly.</p>
          <Link href="/software">Return to the software directory</Link>
        </section>
      </main>
    );

  const item = result.item;
  const softwareName = item.name;
  const shortDescription = item.description;
  const bestFor = item.bestFor;
  const pricing = item.pricing;
  const freePlan = item.hasFreePlan;
  const freeTrial = item.hasFreeTrial;
  const websiteUrl = item.websiteUrl;
  const vendorName = item.vendor.name;
  const category =
    categories?.status === "success"
      ? (categories.categories.find(
          (c) => returnTo === `/categories/${encodeURIComponent(c.slug)}`,
        ) ?? categories.categories[0])
      : undefined;
  const back = safeReturnPath(
    returnTo ?? (category ? `/categories/${encodeURIComponent(category.slug)}` : undefined),
  );
  const website = safeReviewUrl(websiteUrl);
  const websiteHost = website ? new URL(website).hostname.replace(/^www\./, "") : null;

  return (
    <main className="software-detail-page">
      <Breadcrumbs
        items={[
          { label: "Software", href: "/software" },
          ...(category
            ? [{ label: category.name, href: `/categories/${encodeURIComponent(category.slug)}` }]
            : []),
          { label: softwareName },
        ]}
      />
      <article className="software-detail-card">
        <header className="software-profile-heading">
          <div className="software-profile-main">
            <div className="product-title">
              <SoftwareLogo logo={item.logo} name={softwareName} />
              <div>
                <p className="eyebrow">Software profile</p>
                <h1>{softwareName}</h1>
                {vendorName ? (
                  <p className="software-detail-vendor">
                    <MarketplaceGlyph name="vendor" />
                    <span>{vendorName}</span>
                  </p>
                ) : null}
              </div>
            </div>
            <p className="software-detail-description">{shortDescription}</p>
            {categories?.status === "success" && categories.categories.length > 0 ? (
              <nav className="category-tags" aria-label="Software categories">
                {categories.categories.map((category) => (
                  <Link
                    key={category.slug}
                    href={`/categories/${encodeURIComponent(category.slug)}`}
                  >
                    {category.name}
                  </Link>
                ))}
              </nav>
            ) : null}
            {categories?.status === "error" ? (
              <p className="catalog-detail">Category information is temporarily unavailable.</p>
            ) : null}
          </div>
          <div className="software-profile-action">
            <a
              className="primary"
              href={`/go/${encodeURIComponent(item.slug)}`}
              rel="sponsored nofollow noopener noreferrer"
            >
              Visit {softwareName}
              <MarketplaceGlyph name="external" />
            </a>
            {websiteHost ? (
              <p className="official-site-label">Official site: {websiteHost}</p>
            ) : (
              <p className="official-site-label">
                The official website link is currently unavailable.
              </p>
            )}
            <p className="vendor-responsibility">
              Purchases and support are handled by the vendor.
            </p>
          </div>
        </header>
        <div className="software-profile-body">
          <section className="product-fit-panel" aria-label="Product essentials">
            <div className="fit-heading">
              <span>
                <MarketplaceGlyph name="fit" />
              </span>
              <div>
                <p className="eyebrow">Evaluate the fit</p>
                <h2>Is {softwareName} a fit for your business?</h2>
              </div>
            </div>
            <dl className="software-detail-facts">
              {bestFor ? (
                <div>
                  <dt>Best for</dt>
                  <dd>{bestFor}</dd>
                </div>
              ) : null}
              {pricing ? (
                <div>
                  <dt>Pricing</dt>
                  <dd>{pricing}</dd>
                </div>
              ) : null}
            </dl>
            {freePlan || freeTrial ? (
              <ul className="catalog-options" aria-label="Available options">
                {freePlan ? <li>Free plan</li> : null}
                {freeTrial ? <li>Free trial</li> : null}
              </ul>
            ) : null}
            <p className="product-guidance">
              Consider your team&apos;s workflow, budget and requirements. Confirm current features
              and plan details on the official website.
            </p>
          </section>
          {item.slug === "pipedrive" ? (
            <p className="verification-link">
              {/* Temporary Sovrn onboarding verification link; remove after site approval. */}
              <a href="https://sovrn.co/vmi0kgu" rel="sponsored nofollow">
                Visit Pipedrive
              </a>
            </p>
          ) : null}
        </div>
      </article>
      {related.length > 0 && (
        <section className="related-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Compare the market</p>
              <h2>Related software</h2>
            </div>
            {category ? (
              <Link className="text-link" href={`/categories/${encodeURIComponent(category.slug)}`}>
                View {category.name} →
              </Link>
            ) : null}
          </div>
          <SoftwareCatalog compact result={{ status: "success", items: related }} returnTo={back} />
        </section>
      )}
      <DiscoveryNext />
    </main>
  );
}
