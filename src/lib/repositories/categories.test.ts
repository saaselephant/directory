import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));

import { getPublicCategoryBySlug, listPublicCategories } from "./categories";

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
