import type { Metadata } from "next";
import { listPublicCategories } from "@/lib/repositories/categories";
import { searchPublishedSoftware } from "@/lib/repositories/search";

import { SoftwareCatalog } from "./software-catalog";
import { SoftwareFilters } from "./software-filters";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Software directory",
  description:
    "Browse business software on SaaSElephant. Search by product, vendor or use case and compare pricing and available plans.",
};

interface SoftwareIndexPageProps {
  searchParams: Promise<{ q?: string | string[]; category?: string | string[] }>;
}

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function SoftwareIndexPage({ searchParams }: SoftwareIndexPageProps) {
  const params = await searchParams;
  const [result, categories] = await Promise.all([
    searchPublishedSoftware({
      query: firstValue(params.q),
      categorySlug: firstValue(params.category),
    }),
    listPublicCategories(),
  ]);
  const filtered = Boolean(result.filters.query || result.filters.categorySlug);

  return (
    <main className="catalog-page">
      <header className="catalog-header">
        <p className="eyebrow">Find your next tool</p>
        <h1>Software directory</h1>
        <p className="lede">
          Explore software for your business. Search by name, vendor or the work you need to do.
        </p>
      </header>
      <SoftwareFilters categories={categories} filters={result.filters} />
      {result.status === "success" ? (
        <p className="catalog-result-summary" role="status">
          {result.items.length} {result.items.length === 1 ? "tool" : "tools"} to explore
          {filtered ? " matching your search" : ""}
        </p>
      ) : null}
      <SoftwareCatalog filtered={filtered} result={result} />
    </main>
  );
}
