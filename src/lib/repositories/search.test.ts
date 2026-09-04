import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));

const { getPublicCategoryBySlug, listPublicCategorySoftwareIds, listPublishedSoftwareMatching } =
  vi.hoisted(() => ({
    getPublicCategoryBySlug: vi.fn(),
    listPublicCategorySoftwareIds: vi.fn(),
    listPublishedSoftwareMatching: vi.fn(),
  }));

vi.mock("@/lib/repositories/categories", () => ({
  getPublicCategoryBySlug,
  listPublicCategorySoftwareIds,
}));
vi.mock("@/lib/repositories/software", () => ({ listPublishedSoftwareMatching }));

import {
  normalizeSoftwareSearchParams,
  searchPublishedSoftware,
  SOFTWARE_SEARCH_QUERY_MAX_LENGTH,
} from "./search";

const client = {} as SupabaseClient<Database>;

describe("software search repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPublishedSoftwareMatching.mockResolvedValue({ status: "empty", items: [] });
  });

  it("normalizes whitespace and ignores an empty query", () => {
    expect(normalizeSoftwareSearchParams({ query: "  project   planning  " })).toEqual({
      query: "project planning",
      categorySlug: "",
    });
    expect(normalizeSoftwareSearchParams({ query: "   " }).query).toBe("");
  });

  it("caps query text at the documented maximum", () => {
    expect(normalizeSoftwareSearchParams({ query: "x".repeat(150) }).query).toHaveLength(
      SOFTWARE_SEARCH_QUERY_MAX_LENGTH,
    );
  });

  it("supports no-filter and keyword searches", async () => {
    await searchPublishedSoftware({}, client);
    expect(listPublishedSoftwareMatching).toHaveBeenLastCalledWith(
      { query: undefined, softwareIds: undefined },
      client,
    );

    await searchPublishedSoftware({ query: " project " }, client);
    expect(listPublishedSoftwareMatching).toHaveBeenLastCalledWith(
      { query: "project", softwareIds: undefined },
      client,
    );
  });

  it("applies visible category relationships with a keyword", async () => {
    getPublicCategoryBySlug.mockResolvedValue({
      status: "success",
      category: { slug: "crm", name: "CRM", description: null },
      categoryId: "internal-category-id",
    });
    listPublicCategorySoftwareIds.mockResolvedValue({
      status: "success",
      softwareIds: ["software-1"],
    });

    await searchPublishedSoftware({ query: "sales", categorySlug: "crm" }, client);

    expect(getPublicCategoryBySlug).toHaveBeenCalledWith("crm", client);
    expect(listPublishedSoftwareMatching).toHaveBeenCalledWith(
      { query: "sales", softwareIds: ["software-1"] },
      client,
    );
  });

  it("returns a non-disclosing empty state for a hidden or invalid category", async () => {
    getPublicCategoryBySlug.mockResolvedValue({ status: "not_found" });

    await expect(searchPublishedSoftware({ categorySlug: "hidden" }, client)).resolves.toEqual({
      status: "empty",
      items: [],
      reason: "category_unavailable",
      filters: { query: "", categorySlug: "hidden" },
    });
    expect(listPublishedSoftwareMatching).not.toHaveBeenCalled();
  });

  it("returns safe repository errors", async () => {
    const error = { code: "PGRST000", message: "failure", details: null, hint: null };
    listPublishedSoftwareMatching.mockResolvedValue({ status: "error", error });

    await expect(searchPublishedSoftware({ query: "crm" }, client)).resolves.toEqual({
      status: "error",
      error,
      filters: { query: "crm", categorySlug: "" },
    });
  });
});
