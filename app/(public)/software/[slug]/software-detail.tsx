import Link from "next/link";
import { Breadcrumbs, DiscoveryNext, safeReturnPath } from "../../discovery";
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
  const backLabel =
    back.startsWith("/categories/") && category
      ? category.name
      : back.includes("?")
        ? "Search results"
        : "Software directory";
  const website = safeReviewUrl(websiteUrl);

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
      <Link className="software-detail-back" href={back}>
        ← Back to {backLabel}
      </Link>
      <article className="software-detail-card">
        <header className="software-profile-heading">
          <p className="eyebrow">Software overview</p>
          <div className="product-title">
            <SoftwareLogo logo={item.logo} name={softwareName} />
            <h1>{softwareName}</h1>
          </div>
          {vendorName ? <p className="software-detail-vendor">by {vendorName}</p> : null}
          <p className="software-detail-description">{shortDescription}</p>
          {categories?.status === "success" && categories.categories.length > 0 ? (
            <nav className="category-tags" aria-label="Software categories">
              {categories.categories.map((category) => (
                <Link key={category.slug} href={`/categories/${encodeURIComponent(category.slug)}`}>
                  {category.name}
                </Link>
              ))}
            </nav>
          ) : null}
          {categories?.status === "error" ? (
            <p className="catalog-detail">Category information is temporarily unavailable.</p>
          ) : null}
          <a
            className="primary"
            href={`/go/${encodeURIComponent(item.slug)}`}
            rel="sponsored nofollow noopener noreferrer"
          >
            Visit {softwareName} ↗
          </a>
          <a className="text-link profile-explore" href="#product-essentials">
            Explore the essentials ↓
          </a>
        </header>
        <div className="software-profile-body">
          <section id="product-essentials" aria-label="Product essentials">
            <h2>Is {softwareName} a fit for your business?</h2>
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
          <aside className="vendor-next-step">
            <p className="eyebrow">Your next step</p>
            <h2>Explore {softwareName}</h2>
            <p>Get the latest product information directly from the vendor.</p>
            <a
              className="primary software-detail-cta"
              href={`/go/${encodeURIComponent(item.slug || "")}`}
              rel="sponsored nofollow noopener noreferrer"
            >
              Visit {softwareName} <span aria-hidden="true">↗</span>
            </a>
            {website ? (
              <p>
                <a href={website} rel="noopener noreferrer">
                  Official website
                </a>
              </p>
            ) : (
              <p>The official website link is currently unavailable.</p>
            )}
            <p className="vendor-responsibility">
              Purchases, payment, support and onboarding are handled directly by the vendor.
            </p>
          </aside>
        </div>
      </article>
      {related.length > 0 && (
        <section className="related-section">
          <p className="eyebrow">Consider your options</p>
          <h2>Other tools in the same categories</h2>
          <p className="section-intro">
            Explore these related tools to understand how each fits your requirements.
          </p>
          <SoftwareCatalog result={{ status: "success", items: related }} returnTo={back} />
        </section>
      )}
      <DiscoveryNext />
    </main>
  );
}
