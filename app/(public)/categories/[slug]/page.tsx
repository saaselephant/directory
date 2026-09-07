import { cache } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  getPublicCategoryBySlug,
  listPublicCategories,
  listPublishedSoftwareByCategorySlug,
} from "@/lib/repositories/categories";
import {
  SOFTWARE_PAGE_SIZE,
  paginationHref,
  parsePageParam,
} from "../../pagination";

import { buildCategoryMetadata, CategoryDetail } from "./category-detail";

export const dynamic = "force-dynamic";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}

const getCategory = cache(getPublicCategoryBySlug);

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const result = await getCategory((await params).slug);
  return result.status === "success"
    ? buildCategoryMetadata(result.category)
    : { title: "Software categories" };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const slug = (await params).slug;
  const page = parsePageParam((await searchParams).page);
  const result = await listPublishedSoftwareByCategorySlug(
    slug,
    undefined,
    { page, pageSize: SOFTWARE_PAGE_SIZE },
  );
  if (result.status === "not_found") notFound();
  const total = result.status === "success" ? (result.total ?? 0) : 0;
  const totalPages = Math.ceil(total / SOFTWARE_PAGE_SIZE);
  const pathname = `/categories/${encodeURIComponent(slug)}`;
  if (page > 1 && result.status === "error" && result.error.code === "PGRST103") {
    redirect(paginationHref(pathname, 1));
  }
  if (totalPages > 0 && page > totalPages) redirect(paginationHref(pathname, totalPages));
  if (page > 1 && result.status === "success" && result.items.length === 0) {
    redirect(paginationHref(pathname, 1));
  }
  const categories = await listPublicCategories();
  return (
    <CategoryDetail
      categories={categories}
      currentPage={page}
      pathname={pathname}
      result={result}
      totalPages={totalPages}
    />
  );
}
