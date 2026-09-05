import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SoftwareCatalogItem, SoftwareId } from "@/types/models";

import { buildCategoryMetadata, CategoryDetail } from "./category-detail";

const software: SoftwareCatalogItem = {
  id: "internal-id" as SoftwareId,
  slug: "useful-tool",
  name: "Useful Tool",
  description: "Useful description.",
  bestFor: null,
  pricing: null,
  hasFreePlan: false,
  hasFreeTrial: false,
  websiteUrl: "https://vendor.example",
  vendor: { id: "internal-vendor", name: "Vendor", slug: "vendor", websiteUrl: null },
};

const category = { slug: "crm", name: "CRM", description: "Customer relationship tools." };

describe("CategoryDetail", () => {
  it("renders visible software with an internal detail link and safe metadata", () => {
    const html = renderToStaticMarkup(
      <CategoryDetail result={{ status: "success", category, items: [software] }} />,
    );
    expect(html).toContain("CRM");
    expect(html).toContain('href="/software/useful-tool"');
    expect(html).not.toContain("internal-id");
    expect(html).not.toContain("internal-vendor");
    expect(html).not.toContain("https://vendor.example");
    expect(html).not.toContain("affiliate");
    expect(buildCategoryMetadata(category)).toEqual({
      title: "CRM",
      description: "Customer relationship tools.",
    });
  });

  it("renders a clean category-with-no-products state", () => {
    const html = renderToStaticMarkup(
      <CategoryDetail result={{ status: "success", category, items: [] }} />,
    );
    expect(html).toContain("preparing recommendations for this category");
  });

  it("uses conservative metadata when description is unavailable", () => {
    expect(buildCategoryMetadata({ ...category, description: null })).toEqual({
      title: "CRM",
      description: "Browse CRM software on SaaSElephant.",
    });
  });
});
