import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublishedSoftwareBySlug } from "@/lib/repositories/software";
import {
  listPublicCategoriesForSoftware,
  listPublishedSoftwareByCategorySlug,
} from "@/lib/repositories/categories";

import { buildSoftwareMetadata, SoftwareDetail } from "./software-detail";

export const dynamic = "force-dynamic";

interface SoftwareDetailPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ from?: string | string[] }>;
}

const getSoftware = cache(getPublishedSoftwareBySlug);

export async function generateMetadata({ params }: SoftwareDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getSoftware(slug);

  if (result.status !== "success") {
    return { title: "Software directory" };
  }

  return buildSoftwareMetadata(result.item);
}

export default async function SoftwareDetailPage({
  params,
  searchParams,
}: SoftwareDetailPageProps) {
  const { slug } = await params;
  const result = await getSoftware(slug);

  if (result.status === "not_found") {
    notFound();
  }

  const categories =
    result.status === "success" ? await listPublicCategoriesForSoftware(result.item.id) : undefined;

  const from = (await searchParams)?.from;
  const relatedResults =
    categories?.status === "success"
      ? await Promise.all(
          categories.categories.slice(0, 3).map((category) =>
            listPublishedSoftwareByCategorySlug(category.slug, undefined, {
              page: 1,
              pageSize: 7,
            }),
          ),
        )
      : [];
  const related = [
    ...new Map(
      relatedResults
        .flatMap((group) => (group.status === "success" ? group.items : []))
        .filter((item) => result.status === "success" && item.id !== result.item.id)
        .map((item) => [item.id, item]),
    ).values(),
  ].slice(0, 6);
  return (
    <SoftwareDetail
      result={result}
      categories={categories}
      returnTo={Array.isArray(from) ? from[0] : from}
      related={related}
    />
  );
}
