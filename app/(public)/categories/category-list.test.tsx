import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CategoryList } from "./category-list";

describe("CategoryList", () => {
  it("renders public categories with internal links and no IDs", () => {
    const html = renderToStaticMarkup(
      <CategoryList
        result={{
          status: "success",
          categories: [{ slug: "crm", name: "CRM", description: "Customer relationship tools." }],
        }}
      />,
    );
    expect(html).toContain('href="/categories/crm"');
    expect(html).toContain("Customer relationship tools.");
    expect(html).not.toContain("category_id");
  });

  it("renders an intentional empty state", () => {
    const html = renderToStaticMarkup(
      <CategoryList result={{ status: "empty", categories: [] }} />,
    );
    expect(html).toContain("preparing the first software categories");
  });

  it("renders errors without diagnostics", () => {
    const html = renderToStaticMarkup(
      <CategoryList
        result={{
          status: "error",
          error: { code: "private", message: "private", details: "private", hint: "private" },
        }}
      />,
    );
    expect(html).toContain("couldn&#x27;t load the category directory");
    expect(html).not.toContain("private");
  });
});
