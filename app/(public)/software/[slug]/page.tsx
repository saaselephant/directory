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

  const catalogItem = {
    software_name: result.item.name || '',
    short_description: result.item.description || '',
    software_id: result.item.id || '',
    slug: result.item.slug || '',
    vendor: typeof result.item.vendor === 'object' ? ((result.item.vendor as any)?.name || '') : (result.item.vendor || ''),
    website_url: result.item.websiteUrl || ''
  };

  return buildSoftwareMetadata(catalogItem);
}

export default async function SoftwareDetailPage({ params }: SoftwareDetailPageProps) {
  const { slug } = await params;
  const result = await getSoftware(slug);

  if (result.status === "not_found") {
    notFound();
  }

  let normalizedResult = { ...result } as any;
  if (result.status === "success" && result.item) {
    normalizedResult.item = {
      software_id: result.item.id,
      software_name: result.item.name,
      slug: result.item.slug,
      vendor: typeof result.item.vendor === 'object' ? ((result.item.vendor as any)?.name || '') : (result.item.vendor || ''),
      website_url: result.item.websiteUrl,
      short_description: result.item.description,
      best_for: result.item.bestFor,
      pricing: result.item.pricing,
      free_plan: result.item.hasFreePlan,
      free_trial: result.item.hasFreeTrial
    };
  }

  const categories =
    result.status === "success" ? await listPublicCategoriesForSoftware(result.item.id) : undefined;

  return <SoftwareDetail result={normalizedResult} categories={categories} />;
}
