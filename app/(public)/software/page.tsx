import { listPublicCategories } from "@/lib/repositories/categories";
import { searchPublishedSoftware } from "@/lib/repositories/search";

import { SoftwareCatalog } from "./software-catalog";
import { SoftwareFilters } from "./software-filters";

export const dynamic = "force-dynamic";

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
        <p className="eyebrow">Catalog</p>
        <h1>Software directory</h1>
        <p className="lede">Clear, practical software recommendations for growing teams.</p>
      </header>
      <SoftwareFilters categories={categories} filters={result.filters} />
      <SoftwareCatalog filtered={filtered} result={result} />
    </main>
  );
}
