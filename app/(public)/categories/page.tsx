import { Breadcrumbs, DiscoveryNext } from "../discovery";
import type { Metadata } from "next";

import { listPublicCategories } from "@/lib/repositories/categories";

import { CategoryList } from "./category-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Software categories",
  description: "Find business software by category and explore tools for the work you do.",
};

export default async function CategoriesPage() {
  const result = await listPublicCategories();

  return (
    <main className="catalog-page">
      <Breadcrumbs items={[{ label: "Categories" }]} />
      <header className="catalog-header">
        <p className="eyebrow">Categories</p>
        <h1>Start with the work you want to do.</h1>
        <p className="lede">Explore software grouped around practical business needs.</p>
      </header>
      <CategoryList result={result} />
      <DiscoveryNext title="Have a specific tool in mind?" />
    </main>
  );
}
