import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ software: vi.fn() }));
vi.mock("@/lib/repositories/software", () => ({ listPublishedSoftware: mocks.software }));
import HomePage from "./page";
describe("public homepage", () => {
  it("keeps search available with an intentional empty catalog", async () => {
    mocks.software.mockResolvedValue({ status: "empty", items: [] });
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain('action="/software"');
    expect(html).toContain('name="q"');
    expect(html).toContain("preparing the first software recommendations");
    expect(html).not.toContain("/admin");
  });
  it("caps the alphabetical shelf at six returned products", async () => {
    mocks.software.mockResolvedValue({
      status: "success",
      items: Array.from({ length: 8 }, (_, i) => ({
        id: String(i),
        slug: `product-${i}`,
        name: `Product ${i}`,
        description: "Useful software",
        vendor: { name: "Vendor" },
      })),
    });
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("Product 5");
    expect(html).not.toContain("Product 6");
  });
  it("does not expose database diagnostics when catalog reads fail", async () => {
    mocks.software.mockResolvedValue({ status: "error", error: { message: "secret SQL" } });
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain('action="/software"');
    expect(html).toContain("load the software directory");
    expect(html).not.toContain("secret SQL");
  });
});
