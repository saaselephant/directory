import Link from "next/link";
import { Breadcrumbs, DiscoveryNext, MarketplaceGlyph } from "../discovery";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listPublicCategories } from "@/lib/repositories/categories";
import { searchPublishedSoftware } from "@/lib/repositories/search";
import { Pagination, SOFTWARE_PAGE_SIZE, paginationHref, parsePageParam } from "../pagination";

import { SoftwareCatalog } from "./software-catalog";
import { SoftwareFilters } from "./software-filters";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Software directory",
  description:
    "Browse business software on SaaSElephant. Search by product, vendor or use case and compare pricing and available plans.",
};

interface SoftwareIndexPageProps {
  searchParams: Promise<{
    q?: string | string[];
    category?: string | string[];
    page?: string | string[];
  }>;
}

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function SoftwareIndexPage({ searchParams }: SoftwareIndexPageProps) {
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const [result, categories] = await Promise.all([
    searchPublishedSoftware({
      query: firstValue(params.q),
      categorySlug: firstValue(params.category),
      page,
      pageSize: SOFTWARE_PAGE_SIZE,
    }),
    listPublicCategories(),
  ]);
  const filtered = Boolean(result.filters.query || result.filters.categorySlug);
  const selectedCategory =
    categories.status === "success"
      ? categories.categories.find((category) => category.slug === result.filters.categorySlug)
      : undefined;

  const total = result.status === "error" ? 0 : (result.total ?? 0);
  const totalPages = Math.ceil(total / SOFTWARE_PAGE_SIZE);
  const preservedParams = {
    q: result.filters.query,
    category: result.filters.categorySlug,
  };
  if (page > 1 && result.status === "error" && result.error.code === "PGRST103") {
    redirect(paginationHref("/software", 1, preservedParams));
  }
  if (totalPages > 0 && page > totalPages) {
    redirect(paginationHref("/software", totalPages, preservedParams));
  }
  if (page > 1 && result.status === "empty") {
    redirect(paginationHref("/software", 1, preservedParams));
  }
  const returnTo = paginationHref("/software", page, preservedParams);
  return (
    <main className="catalog-page">
      <Breadcrumbs items={[{ label: "Software" }]} />
      <header className="catalog-header">
        <span className="category-header-icon">
          <MarketplaceGlyph name="discovery" />
        </span>
        <div>
          <p className="eyebrow">The software marketplace</p>
          <h1>Find your next better way to work.</h1>
          <p className="lede">
            Search {total || "the catalog"} business software products by name, vendor or use case.
          </p>
        </div>
      </header>
      <section className="directory-search-panel" aria-label="Search the software directory">
        <SoftwareFilters categories={categories} filters={result.filters} />
        <div className="directory-results-bar">
          {result.status === "success" ? (
            <p className="catalog-result-summary" role="status">
              <strong>{total}</strong> {total === 1 ? "product" : "products"}
              {filtered ? " matching your search" : ""}
            </p>
          ) : null}
          <Link className="text-link" href="/categories">
            Browse by business need →
          </Link>
        </div>
      </section>
      <SoftwareCatalog
        contextLabel={selectedCategory ? `In ${selectedCategory.name}` : undefined}
        filtered={filtered}
        result={result}
        returnTo={returnTo}
      />
      <Pagination
        currentPage={page}
        pathname="/software"
        searchParams={preservedParams}
        totalPages={totalPages}
      />
      <DiscoveryNext />
    </main>
  );
}
