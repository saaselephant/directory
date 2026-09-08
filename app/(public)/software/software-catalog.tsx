import Link from "next/link";

import type { PublishedSoftwareResult } from "@/lib/repositories/software";
import type { SoftwareSearchResult } from "@/lib/repositories/search";
import { SoftwareLogo } from "./software-logo";

interface SoftwareCatalogProps {
  result: PublishedSoftwareResult | SoftwareSearchResult;
  filtered?: boolean;
  returnTo?: string;
  contextLabel?: string;
  compact?: boolean;
}

export function SoftwareCatalog({
  result,
  filtered = false,
  returnTo = "/software",
  contextLabel,
  compact = false,
}: SoftwareCatalogProps) {
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
    <section
      aria-label="Software results"
      className={`catalog-grid${compact ? " catalog-grid-compact" : ""}`}
    >
      {result.items.map((item) => {
        const href = `/software/${encodeURIComponent(item.slug)}?from=${encodeURIComponent(returnTo)}`;
        if (compact) {
          const compactSupport =
            item.vendor.name &&
            item.vendor.name.trim().toLocaleLowerCase() !== item.name.trim().toLocaleLowerCase()
              ? item.vendor.name
              : (item.bestFor ?? item.description);
          return (
            <article className="catalog-card catalog-card-compact" key={item.id}>
              <div className="catalog-card-heading">
                <SoftwareLogo logo={item.logo} name={item.name} />
                <div>
                  <h2>
                    <Link href={href}>{item.name}</Link>
                  </h2>
                  <p className="compact-product-support">{compactSupport}</p>
                  <Link className="catalog-detail-link" href={href}>
                    <span>Explore</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
            </article>
          );
        }
        return (
          <article className="catalog-card" key={item.id}>
            {contextLabel ? <p className="catalog-context">{contextLabel}</p> : null}
            <div className="catalog-card-heading">
              <SoftwareLogo logo={item.logo} name={item.name} />
              <div>
                <h2>
                  <Link href={href}>{item.name}</Link>
                </h2>
                {item.vendor.name ? <p className="catalog-vendor">by {item.vendor.name}</p> : null}
              </div>
            </div>
            {item.description ? <p className="catalog-description">{item.description}</p> : null}
            {item.bestFor || item.pricing ? (
              <dl className="catalog-metadata">
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
            ) : null}
            {item.hasFreePlan || item.hasFreeTrial ? (
              <ul className="catalog-options" aria-label="Available options">
                {item.hasFreePlan ? <li>Free plan</li> : null}
                {item.hasFreeTrial ? <li>Free trial</li> : null}
              </ul>
            ) : null}
            <Link className="catalog-detail-link" href={href}>
              <span>Explore {item.name}</span>
              <span aria-hidden="true">→</span>
            </Link>
          </article>
        );
      })}
    </section>
  );
}
