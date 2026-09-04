import type { Metadata } from "next";

import { listPublicCategories } from "@/lib/repositories/categories";

import { CategoryList } from "./category-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Software categories",
  description: "Browse published software recommendations by category.",
};

export default async function CategoriesPage() {
  const result = await listPublicCategories();

  return (
    <main className="catalog-page">
      <header className="catalog-header">
        <p className="eyebrow">Categories</p>
        <h1>Browse software by category</h1>
        <p className="lede">Explore software grouped around practical business needs.</p>
      </header>
      <CategoryList result={result} />
    </main>
  );
}
