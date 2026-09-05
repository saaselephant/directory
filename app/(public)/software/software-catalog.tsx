import Link from "next/link";

import type { PublishedSoftwareResult } from "@/lib/repositories/software";
import type { SoftwareSearchResult } from "@/lib/repositories/search";

interface SoftwareCatalogProps {
  result: PublishedSoftwareResult | SoftwareSearchResult;
  filtered?: boolean;
}

export function SoftwareCatalog({ result, filtered = false }: SoftwareCatalogProps) {
  if (result.status === "error") {
    return (
      <section className="catalog-state" aria-labelledby="catalog-error-title">
        <h2 id="catalog-error-title">We couldn&apos;t load the software directory.</h2>
        <p>Please try again shortly.</p>
      </section>
    );
  }

  if (result.status === "empty") {
    if ("reason" in result && result.reason === "category_unavailable") {
      return (
        <section className="catalog-state" aria-labelledby="catalog-empty-title">
          <h2 id="catalog-empty-title">That category isn&apos;t available.</h2>
          <p>Try another category or clear the filters.</p>
          <Link className="secondary" href="/software">
            Browse all software
          </Link>
        </section>
      );
    }

    if (filtered) {
      return (
        <section className="catalog-state" aria-labelledby="catalog-empty-title">
          <h2 id="catalog-empty-title">No software found.</h2>
          <p>Try a broader search, a vendor name or a different category.</p>
          <Link className="secondary" href="/software">
            Clear filters
          </Link>
        </section>
      );
    }

    return (
      <section className="catalog-state" aria-labelledby="catalog-empty-title">
        <h2 id="catalog-empty-title">We&apos;re preparing the first software recommendations.</h2>
        <p>
          Our opening collection is being prepared. Soon you’ll be able to explore product details
          and find tools for your business.
        </p>
        <Link className="text-link" href="/categories">
          Explore categories →
        </Link>
      </section>
    );
  }

  return (
    <section aria-label="Software results" className="catalog-grid">
      {result.items.map((item) => (
        <article className="catalog-card" key={item.id}>
          <div className="catalog-card-heading">
            <div>
              <h2>
                <Link href={`/software/${encodeURIComponent(item.slug)}`}>{item.name}</Link>
              </h2>
              {item.vendor.name ? <p className="catalog-vendor">by {item.vendor.name}</p> : null}
            </div>
          </div>
          {item.description ? <p className="catalog-description">{item.description}</p> : null}
          {item.bestFor ? (
            <p className="catalog-detail">
              <strong>Best for:</strong> {item.bestFor}
            </p>
          ) : null}
          {item.pricing ? (
            <p className="catalog-detail">
              <strong>Pricing:</strong> {item.pricing}
            </p>
          ) : null}
          {item.hasFreePlan || item.hasFreeTrial ? (
            <ul className="catalog-options" aria-label="Available options">
              {item.hasFreePlan ? <li>Free plan</li> : null}
              {item.hasFreeTrial ? <li>Free trial</li> : null}
            </ul>
          ) : null}
          <Link className="catalog-detail-link" href={`/software/${encodeURIComponent(item.slug)}`}>
            View software
          </Link>
        </article>
      ))}
    </section>
  );
}
