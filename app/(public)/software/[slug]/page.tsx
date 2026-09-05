import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublishedSoftwareBySlug } from "@/lib/repositories/software";
import { listPublicCategoriesForSoftware } from "@/lib/repositories/categories";

import { buildSoftwareMetadata, SoftwareDetail } from "./software-detail";

export const dynamic = "force-dynamic";

interface SoftwareDetailPageProps {
  params: Promise<{ slug: string }>;
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

export default async function SoftwareDetailPage({ params }: SoftwareDetailPageProps) {
  const { slug } = await params;
  const result = await getSoftware(slug);

  if (result.status === "not_found") {
    notFound();
  }

  const categories =
    result.status === "success" ? await listPublicCategoriesForSoftware(result.item.id) : undefined;
  return <SoftwareDetail result={result} categories={categories} />;
}
