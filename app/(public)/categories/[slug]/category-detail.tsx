import Link from "next/link";
import type { Metadata } from "next";

import { SoftwareCatalog } from "../../software/software-catalog";
import type { PublishedSoftwareByCategoryResult } from "@/lib/repositories/categories";
import type { PublicCategory } from "@/types/models";

export function buildCategoryMetadata(category: PublicCategory): Metadata {
  return {
    title: category.name,
    description:
      category.description ?? `Browse published ${category.name} software on SaaSElephant.`,
  };
}

export function CategoryDetail({
  result,
}: {
  result: Exclude<PublishedSoftwareByCategoryResult, { status: "not_found" }>;
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

  return (
    <main className="catalog-page">
      <Link className="software-detail-back" href="/categories">
        ← All categories
      </Link>
      <header className="catalog-header">
        <p className="eyebrow">Category</p>
        <h1>{result.category.name}</h1>
        {result.category.description ? <p className="lede">{result.category.description}</p> : null}
      </header>
      {result.items.length > 0 ? (
        <SoftwareCatalog result={{ status: "success", items: result.items }} />
      ) : (
        <section className="catalog-state">
          <h2>We&apos;re preparing recommendations for this category.</h2>
          <p>Check back soon.</p>
        </section>
      )}
    </main>
  );
}
