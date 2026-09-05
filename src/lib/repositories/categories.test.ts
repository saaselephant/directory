import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));

import {
  getPublicCategoryBySlug,
  listPublicCategories,
  listPublicCategoriesForSoftware,
} from "./categories";

function createClient(response: { data: unknown; error: unknown }) {
  const overrideTypes = vi.fn().mockResolvedValue(response);
  const order = vi.fn(() => ({ overrideTypes }));
  const maybeSingle = vi.fn(() => ({ overrideTypes }));
  const eq = vi.fn();
  const query = { eq, order, maybeSingle };
  eq.mockReturnValue(query);
  const select = vi.fn(() => query);
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient<Database>, eq };
}

describe("category repository", () => {
  it("maps a successful public category listing", async () => {
    const { client, eq } = createClient({
      data: [{ category_id: "hidden", slug: "crm", category_name: "CRM", description: null }],
      error: null,
    });
    await expect(listPublicCategories(client)).resolves.toEqual({
      status: "success",
      categories: [{ slug: "crm", name: "CRM", description: null }],
    });
    expect(eq).toHaveBeenCalledWith("publication_status", "published");
  });

  it("returns empty and typed error states", async () => {
    await expect(
      listPublicCategories(createClient({ data: [], error: null }).client),
    ).resolves.toEqual({ status: "empty", categories: [] });
    const error = { code: "PGRST000", message: "failure", details: null, hint: null };
    await expect(listPublicCategories(createClient({ data: null, error }).client)).resolves.toEqual(
      { status: "error", error },
    );
  });

  it("treats missing and RLS-hidden categories as not found", async () => {
    const { client, eq } = createClient({ data: null, error: null });
    await expect(getPublicCategoryBySlug("hidden", client)).resolves.toEqual({
      status: "not_found",
    });
    expect(eq).toHaveBeenNthCalledWith(1, "slug", "hidden");
    expect(eq).toHaveBeenNthCalledWith(2, "publication_status", "published");
  });
});

describe("public category context for software", () => {
  function categoryClient(relationships: unknown[], relationshipError: unknown = null) {
    const relationResult = { data: relationships, error: relationshipError };
    const categoryResult = {
      data: [
        {
          category_id: "internal-category",
          slug: "communication",
          category_name: "Communication",
          description: null,
        },
      ],
      error: null,
    };
    const eq = vi.fn();
    const inFilter = vi.fn();
    const categoryQuery = {
      eq,
      in: inFilter,
      order: vi.fn(() => ({ overrideTypes: vi.fn().mockResolvedValue(categoryResult) })),
    };
    eq.mockReturnValue(categoryQuery);
    inFilter.mockReturnValue(categoryQuery);
    const relationEq = vi.fn(() => ({ overrideTypes: vi.fn().mockResolvedValue(relationResult) }));
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => (table === "software_categories" ? { eq: relationEq } : categoryQuery)),
    }));
    return {
      scoped: { from } as unknown as SupabaseClient<Database>,
      eq,
      relationEq,
      inFilter,
      from,
    };
  }
  it("restricts joins to the requested software and published categories and strips internal IDs", async () => {
    const { scoped, eq, relationEq, inFilter } = categoryClient([
      { category_id: "internal-category" },
    ]);
    expect(await listPublicCategoriesForSoftware("software-1", scoped)).toEqual({
      status: "success",
      categories: [{ slug: "communication", name: "Communication", description: null }],
    });
    expect(relationEq).toHaveBeenCalledWith("software_id", "software-1");
    expect(inFilter).toHaveBeenCalledWith("category_id", ["internal-category"]);
    expect(eq).toHaveBeenCalledWith("publication_status", "published");
  });
  it("does not broaden an empty or denied relationship lookup", async () => {
    const empty = categoryClient([]);
    expect(await listPublicCategoriesForSoftware("hidden", empty.scoped)).toEqual({
      status: "empty",
      categories: [],
    });
    expect(empty.from).toHaveBeenCalledTimes(1);
    const denied = categoryClient([], {
      code: "denied",
      message: "private",
      details: null,
      hint: null,
    });
    expect(await listPublicCategoriesForSoftware("hidden", denied.scoped)).toMatchObject({
      status: "error",
    });
    expect(denied.from).toHaveBeenCalledTimes(1);
  });
});
