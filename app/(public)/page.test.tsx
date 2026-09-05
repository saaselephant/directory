import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ categories: vi.fn() }));
vi.mock("@/lib/repositories/categories", () => ({ listPublicCategories: mocks.categories }));
import HomePage from "./page";
describe("public homepage", () => {
  beforeEach(() => mocks.categories.mockResolvedValue({ status: "empty", categories: [] }));
  it("offers both discovery paths and a complete intentional empty homepage", async () => {
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("Your Elephant-Sized");
    expect(html).toContain("saaselephant-elephant.png");
    expect(html).toContain("Store of Software");
    expect(html).toContain("Browse Software");
    expect(html).toContain("Browse Categories");
    expect(html).toContain("How SaaSElephant works");
    expect(html).toContain("preparing the first software categories");
    expect(html).not.toMatch(
      /href="\/admin|Future tracked|Platform foundation|Editorial operations/,
    );
  });
  it("uses only returned public categories, capped at six", async () => {
    mocks.categories.mockResolvedValue({
      status: "success",
      categories: Array.from({ length: 8 }, (_, index) => ({
        slug: "category-" + index,
        name: "Category " + index,
        description: null,
      })),
    });
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain('href="/categories/category-5"');
    expect(html).not.toContain('href="/categories/category-6"');
  });
  it("keeps discovery available when category reads fail without leaking diagnostics", async () => {
    mocks.categories.mockResolvedValue({ status: "error", error: { message: "secret SQL" } });
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("Browse Software");
    expect(html).toContain("couldn&#x27;t load the category directory");
    expect(html).not.toContain("secret SQL");
  });
});
