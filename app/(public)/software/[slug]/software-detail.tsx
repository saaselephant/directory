import Link from "next/link";
import type { Metadata } from "next";
import type { PublishedSoftwareDetailResult } from "@/lib/repositories/software";
import type { PublicCategoriesResult } from "@/lib/repositories/categories";
import type { SoftwareCatalogItem } from "@/types/models";
import { safeReviewUrl } from "@/lib/security/review-url";

interface SoftwareDetailProps {
  result: Exclude<PublishedSoftwareDetailResult, { status: "not_found" }>;
  categories?: PublicCategoriesResult;
}
export function buildSoftwareMetadata(item: SoftwareCatalogItem): Metadata {
  return { title: item.name, description: item.description };
}
export function SoftwareDetail({ result, categories }: SoftwareDetailProps) {
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
  const { item } = result;
  const website = safeReviewUrl(item.websiteUrl);
  return (
    <main className="software-detail-page">
      <Link className="software-detail-back" href="/software">
        ← Software directory
      </Link>
      <article className="software-detail-card">
        <header className="software-profile-heading">
          <p className="eyebrow">Software overview</p>
          <h1>{item.name}</h1>
          {item.vendor.name ? (
            <p className="software-detail-vendor">by {item.vendor.name}</p>
          ) : null}
          <p className="software-detail-description">{item.description}</p>
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
        </header>
        <div className="software-profile-body">
          <section aria-label="Product essentials">
            <h2>Is {item.name} a fit for your business?</h2>
            <dl className="software-detail-facts">
              {item.bestFor ? (
                <div>
                  <dt>Best for</dt>
                  <dd>{item.bestFor}</dd>
                </div>
              ) : null}
              {item.pricing ? (
                <div>
                  <dt>Pricing</dt>
                  <dd>{item.pricing}</dd>
                </div>
              ) : null}
            </dl>
            {item.hasFreePlan || item.hasFreeTrial ? (
              <ul className="catalog-options" aria-label="Available options">
                {item.hasFreePlan ? <li>Free plan</li> : null}
                {item.hasFreeTrial ? <li>Free trial</li> : null}
              </ul>
            ) : null}
            <p className="product-guidance">
              Consider your team&apos;s workflow, budget and requirements. Confirm current features
              and plan details on the official website.
            </p>
          </section>
          <aside className="vendor-next-step">
            <p className="eyebrow">Your next step</p>
            <h2>Explore {item.name}</h2>
            <p>Get the latest product information directly from the vendor.</p>
            {website ? (
              <a className="primary software-detail-cta" href={website} rel="noopener noreferrer">
                Visit {item.name}&apos;s website <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <p>The official website link is currently unavailable.</p>
            )}
            <p className="vendor-responsibility">
              Purchases, payment, support and onboarding are handled directly by the vendor.
            </p>
          </aside>
        </div>
      </article>
    </main>
  );
}
