import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { listPublishedSoftwareByCategorySlug } from "@/lib/repositories/categories";

import { buildCategoryMetadata, CategoryDetail } from "./category-detail";

export const dynamic = "force-dynamic";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

const getCategory = cache(listPublishedSoftwareByCategorySlug);

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const result = await getCategory((await params).slug);
  return result.status === "success"
    ? buildCategoryMetadata(result.category)
    : { title: "Software categories" };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const result = await getCategory((await params).slug);
  if (result.status === "not_found") notFound();
  return <CategoryDetail result={result} />;
}
