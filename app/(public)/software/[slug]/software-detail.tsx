import Link from "next/link";
import type { Metadata } from "next";

import type { PublishedSoftwareDetailResult } from "@/lib/repositories/software";
import type { SoftwareCatalogItem } from "@/types/models";

interface SoftwareDetailProps {
  result: Exclude<PublishedSoftwareDetailResult, { status: "not_found" }>;
}

export function buildSoftwareMetadata(item: SoftwareCatalogItem): Metadata {
  return {
    title: item.name,
    description: item.description,
  };
}

export function SoftwareDetail({ result }: SoftwareDetailProps) {
  if (result.status === "error") {
    return (
      <main className="software-detail-page">
        <section className="catalog-state" aria-labelledby="software-error-title">
          <h1 id="software-error-title">We couldn&apos;t load this software page.</h1>
          <p>Please try again shortly.</p>
          <Link href="/software">Return to the software directory</Link>
        </section>
      </main>
    );
  }

  const { item } = result;

  return (
    <main className="software-detail-page">
      <Link className="software-detail-back" href="/software">
        ← Software directory
      </Link>
      <article className="software-detail-card">
        <p className="eyebrow">Software</p>
        <h1>{item.name}</h1>
        <p className="software-detail-vendor">by {item.vendor.name}</p>
        <p className="software-detail-description">{item.description}</p>

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

        <a className="primary software-detail-cta" href={item.websiteUrl} rel="noopener noreferrer">
          Visit {item.name}&apos;s website
        </a>
      </article>
    </main>
  );
}
