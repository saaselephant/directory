import Link from "next/link";

import type { PublishedSoftwareResult } from "@/lib/repositories/software";

interface SoftwareCatalogProps {
  result: PublishedSoftwareResult;
}

export function SoftwareCatalog({ result }: SoftwareCatalogProps) {
  if (result.status === "error") {
    return (
      <section className="catalog-state" aria-labelledby="catalog-error-title">
        <h2 id="catalog-error-title">We couldn&apos;t load the software directory.</h2>
        <p>Please try again shortly.</p>
      </section>
    );
  }

  if (result.status === "empty") {
    return (
      <section className="catalog-state" aria-labelledby="catalog-empty-title">
        <h2 id="catalog-empty-title">We&apos;re preparing the first software recommendations.</h2>
        <p>Check back soon for thoughtfully selected tools.</p>
      </section>
    );
  }

  return (
    <section aria-label="Published software" className="catalog-grid">
      {result.items.map((item) => (
        <article className="catalog-card" key={item.id}>
          <div className="catalog-card-heading">
            <div>
              <h2>
                <Link href={`/software/${encodeURIComponent(item.slug)}`}>{item.name}</Link>
              </h2>
              <p className="catalog-vendor">by {item.vendor.name}</p>
            </div>
          </div>
          <p>{item.description}</p>
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
