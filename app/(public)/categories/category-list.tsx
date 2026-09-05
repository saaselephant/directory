import Link from "next/link";

import type { PublicCategoriesResult } from "@/lib/repositories/categories";

export function CategoryList({ result }: { result: PublicCategoriesResult }) {
  if (result.status === "error") {
    return (
      <section className="catalog-state">
        <h2>We couldn&apos;t load the category directory.</h2>
        <p>Please try again shortly.</p>
      </section>
    );
  }

  if (result.status === "empty") {
    return (
      <section className="catalog-state">
        <h2>We&apos;re preparing the first software categories.</h2>
        <p>
          Our opening collection is taking shape. Category pages will bring related tools together
          as they become available.
        </p>
        <Link className="text-link" href="/software">
          Browse software →
        </Link>
      </section>
    );
  }

  return (
    <section className="category-grid" aria-label="Software categories">
      {result.categories.map((category) => (
        <article className="category-card" key={category.slug}>
          <h2>
            <Link href={`/categories/${encodeURIComponent(category.slug)}`}>{category.name}</Link>
          </h2>
          {category.description ? <p>{category.description}</p> : null}
          <Link
            className="catalog-detail-link"
            href={`/categories/${encodeURIComponent(category.slug)}`}
          >
            Explore category <span aria-hidden="true">→</span>
          </Link>
        </article>
      ))}
    </section>
  );
}
