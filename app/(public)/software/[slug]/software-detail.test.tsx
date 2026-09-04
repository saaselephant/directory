import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PublishedSoftwareDetailResult } from "@/lib/repositories/software";
import type { SoftwareCatalogItem, SoftwareId } from "@/types/models";

import { buildSoftwareMetadata, SoftwareDetail } from "./software-detail";

const item: SoftwareCatalogItem = {
  id: "internal-software-id" as SoftwareId,
  slug: "useful-tool",
  name: "Useful Tool",
  description: "A concise product description.",
  bestFor: "Small teams",
  pricing: "$10 per month",
  hasFreePlan: true,
  hasFreeTrial: true,
  websiteUrl: "https://vendor.example/product",
  vendor: {
    id: "internal-vendor-id",
    name: "Example Vendor",
    slug: "example-vendor",
    websiteUrl: null,
  },
};

function render(result: Exclude<PublishedSoftwareDetailResult, { status: "not_found" }>) {
  return renderToStaticMarkup(<SoftwareDetail result={result} />);
}

describe("SoftwareDetail", () => {
  it("renders a published software detail model and safe metadata", () => {
    const html = render({ status: "success", item });

    expect(html).toContain("Useful Tool");
    expect(html).toContain("Example Vendor");
    expect(html).toContain("Small teams");
    expect(html).toContain("$10 per month");
    expect(html).toContain("Free plan");
    expect(html).toContain("Free trial");
    expect(html).toContain("https://vendor.example/product");
    expect(buildSoftwareMetadata(item)).toEqual({
      title: "Useful Tool",
      description: "A concise product description.",
    });
  });

  it("omits unknown optional fields", () => {
    const html = render({
      status: "success",
      item: {
        ...item,
        bestFor: null,
        pricing: null,
        hasFreePlan: false,
        hasFreeTrial: false,
      },
    });

    expect(html).not.toContain("Best for");
    expect(html).not.toContain("Pricing");
    expect(html).not.toContain("Free plan");
    expect(html).not.toContain("Free trial");
  });

  it("renders repository errors without leaking diagnostics", () => {
    const html = render({
      status: "error",
      error: {
        code: "private-code",
        message: "private database message",
        details: "private SQL details",
        hint: "private hint",
      },
    });

    expect(html).toContain("couldn&#x27;t load this software page");
    expect(html).not.toContain("private");
  });

  it("does not expose internal state, identifiers, or affiliate destinations", () => {
    const html = render({ status: "success", item });

    expect(html).not.toContain("internal-software-id");
    expect(html).not.toContain("internal-vendor-id");
    expect(html).not.toContain("publication_status");
    expect(html).not.toContain("verification_status");
    expect(html).not.toContain("affiliate");
  });
});
