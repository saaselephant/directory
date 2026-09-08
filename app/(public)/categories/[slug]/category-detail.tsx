import Link from "next/link";
import { Breadcrumbs, CategoryGlyph, DiscoveryNext, categoryGroup } from "../../discovery";
import type { PublicCategoriesResult } from "@/lib/repositories/categories";
import type { Metadata } from "next";

import { SoftwareCatalog } from "../../software/software-catalog";
import { Pagination, paginationHref } from "../../pagination";
import type { PublishedSoftwareByCategoryResult } from "@/lib/repositories/categories";
import type { PublicCategory } from "@/types/models";

export function buildCategoryMetadata(category: PublicCategory): Metadata {
  return {
    title: category.name,
    description: category.description ?? `Browse ${category.name} software on SaaSElephant.`,
  };
}

export function CategoryDetail({
  result,
  categories,
  currentPage = 1,
  pathname,
  totalPages = 0,
  total = 0,
}: {
  categories?: PublicCategoriesResult;
  currentPage?: number;
  pathname?: string;
  result: Exclude<PublishedSoftwareByCategoryResult, { status: "not_found" }>;
  totalPages?: number;
  total?: number;
}) {
  if (result.status === "error") {
    return (
      <main className="catalog-page">
        <section className="catalog-state">
          <h1>We couldn&apos;t load this category.</h1>
          <p>Please try again shortly.</p>
        </section>
      </main>
    );
  }

  const categoryPath = pathname ?? `/categories/${encodeURIComponent(result.category.slug)}`;

  return (
    <main className="catalog-page">
      <Breadcrumbs
        items={[{ label: "Categories", href: "/categories" }, { label: result.category.name }]}
      />
      <header className="catalog-header">
        <span className="category-header-icon">
          <CategoryGlyph category={result.category} />
        </span>
        <div>
          <p className="eyebrow">Software category</p>
          <h1>{result.category.name}</h1>
          {result.category.description ? (
            <p className="lede">{result.category.description}</p>
          ) : null}
          <p className="catalog-count">
            {total} {total === 1 ? "product" : "products"}
          </p>
        </div>
      </header>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Browse and compare</p>
          <h2>Software in this category</h2>
        </div>
        <Link
          className="text-link"
          href={`/software?category=${encodeURIComponent(result.category.slug)}`}
        >
          Search this category →
        </Link>
      </div>
      {result.items.length > 0 ? (
        <SoftwareCatalog
          contextLabel={`In ${result.category.name}`}
          returnTo={paginationHref(categoryPath, currentPage)}
          result={{ status: "success", items: result.items }}
        />
      ) : (
        <section className="catalog-state">
          <h2>We&apos;re preparing recommendations for this category.</h2>
          <p>Explore the wider directory while this collection takes shape.</p>
          <Link className="secondary" href="/software">
            Browse software
          </Link>
        </section>
      )}
      <Pagination currentPage={currentPage} pathname={categoryPath} totalPages={totalPages} />
      {categories?.status === "success" &&
        categories.categories.some(
          (c) =>
            c.slug !== result.category.slug && categoryGroup(c) === categoryGroup(result.category),
        ) && (
          <section className="related-section">
            <h2>Explore nearby categories</h2>
            <nav className="related-links" aria-label="Related categories">
              {categories.categories
                .filter(
                  (c) =>
                    c.slug !== result.category.slug &&
                    categoryGroup(c) === categoryGroup(result.category),
                )
                .slice(0, 4)
                .map((c) => (
                  <Link key={c.slug} href={`/categories/${encodeURIComponent(c.slug)}`}>
                    {c.name} →
                  </Link>
                ))}
            </nav>
          </section>
        )}
      <DiscoveryNext />
    </main>
  );
}
