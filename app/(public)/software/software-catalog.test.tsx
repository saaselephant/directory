import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PublishedSoftwareResult } from "@/lib/repositories/software";
import type { SoftwareCatalogItem, SoftwareId } from "@/types/models";

import { SoftwareCatalog } from "./software-catalog";

const item: SoftwareCatalogItem = {
  id: "software-1" as SoftwareId,
  slug: "useful-tool",
  name: "Useful Tool",
  description: "A concise product description.",
  bestFor: "Small teams",
  pricing: "$10 per month",
  hasFreePlan: true,
  hasFreeTrial: true,
  websiteUrl: "https://example.com",
  vendor: {
    id: null,
    name: "Example Vendor",
    slug: null,
    websiteUrl: null,
  },
};

function render(result: PublishedSoftwareResult) {
  return renderToStaticMarkup(<SoftwareCatalog result={result} />);
}

describe("SoftwareCatalog", () => {
  it("renders published catalogue items from the application model", () => {
    const html = render({ status: "success", items: [item] });

    expect(html).toContain("Useful Tool");
    expect(html).toContain("Example Vendor");
    expect(html).toContain("Small teams");
    expect(html).toContain("$10 per month");
    expect(html).toContain("Free plan");
    expect(html).toContain("Free trial");
    expect(html).toContain('href="/software/useful-tool"');
    expect(html).not.toContain("https://example.com");
    expect(html).not.toContain("affiliate");
  });

  it("renders an intentional empty state", () => {
    const html = render({ status: "empty", items: [] });

    expect(html).toContain("preparing the first software recommendations");
    expect(html).not.toContain("error");
  });

  it("renders a safe error state without repository diagnostics", () => {
    const html = render({
      status: "error",
      error: {
        code: "secret-code",
        message: "sensitive database message",
        details: "sensitive SQL details",
        hint: "internal hint",
      },
    });

    expect(html).toContain("couldn&#x27;t load the software directory");
    expect(html).not.toContain("secret-code");
    expect(html).not.toContain("sensitive");
    expect(html).not.toContain("internal hint");
  });

  it("omits unknown optional catalogue fields", () => {
    const html = render({
      status: "success",
      items: [
        {
          ...item,
          bestFor: null,
          pricing: null,
          hasFreePlan: false,
          hasFreeTrial: false,
        },
      ],
    });

    expect(html).not.toContain("Best for:");
    expect(html).not.toContain("Pricing:");
    expect(html).not.toContain("Free plan");
    expect(html).not.toContain("Free trial");
  });

  it("renders a filtered no-result state", () => {
    const html = renderToStaticMarkup(
      <SoftwareCatalog
        filtered
        result={{
          status: "empty",
          items: [],
          reason: "no_matches",
          filters: { query: "crm", categorySlug: "" },
        }}
      />,
    );

    expect(html).toContain("No software found");
    expect(html).not.toContain("preparing the first software recommendations");
  });

  it("does not reveal an unavailable category", () => {
    const html = renderToStaticMarkup(
      <SoftwareCatalog
        filtered
        result={{
          status: "empty",
          items: [],
          reason: "category_unavailable",
          filters: { query: "", categorySlug: "private-category" },
        }}
      />,
    );

    expect(html).toContain("category isn&#x27;t available");
    expect(html).not.toContain("private-category");
  });
});
