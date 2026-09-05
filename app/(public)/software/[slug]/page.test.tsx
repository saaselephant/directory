import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  software: vi.fn(),
  categories: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/repositories/software", () => ({ getPublishedSoftwareBySlug: mocks.software }));
vi.mock("@/lib/repositories/categories", () => ({
  listPublicCategoriesForSoftware: mocks.categories,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("./software-detail", () => ({
  SoftwareDetail: () => null,
  buildSoftwareMetadata: () => ({}),
}));
import Page from "./page";
describe("public detail category boundary", () => {
  beforeEach(() => vi.clearAllMocks());
  it("does not load relationships for hidden or missing software", async () => {
    mocks.software.mockResolvedValue({ status: "not_found" });
    await expect(Page({ params: Promise.resolve({ slug: "hidden" }) })).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(mocks.categories).not.toHaveBeenCalled();
  });
  it("loads category context only for the returned published software ID", async () => {
    mocks.software.mockResolvedValue({ status: "success", item: { id: "visible-id" } });
    mocks.categories.mockResolvedValue({ status: "empty", categories: [] });
    await Page({ params: Promise.resolve({ slug: "visible" }) });
    expect(mocks.categories).toHaveBeenCalledWith("visible-id");
  });
});
