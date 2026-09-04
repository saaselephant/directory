import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));

import {
  getPublishedSoftwareBySlug,
  listPublishedSoftwareByIds,
  listPublishedSoftwareMatching,
} from "./software";

const publishedRow = {
  software_id: "software-1",
  slug: "useful-tool",
  software_name: "Useful Tool",
  short_description: "A useful product.",
  best_for: null,
  pricing: null,
  free_plan: null,
  free_trial: null,
  website_url: "https://example.com",
  vendor: "Legacy Vendor",
  vendor_id: null,
  vendors: null,
};

function createClient(response: { data: unknown; error: unknown }) {
  const overrideTypes = vi.fn().mockResolvedValue(response);
  const maybeSingle = vi.fn(() => ({ overrideTypes }));
  const order = vi.fn(() => ({ overrideTypes }));
  const eq = vi.fn();
  const inFilter = vi.fn();
  const or = vi.fn();
  const query = { eq, in: inFilter, maybeSingle, or, order };
  eq.mockReturnValue(query);
  inFilter.mockReturnValue(query);
  or.mockReturnValue(query);
  const select = vi.fn(() => query);
  const from = vi.fn(() => ({ select }));

  return {
    client: { from } as unknown as SupabaseClient<Database>,
    eq,
    inFilter,
    or,
  };
}

describe("getPublishedSoftwareBySlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a mapped published item and applies both visibility filters", async () => {
    const { client, eq } = createClient({ data: publishedRow, error: null });

    const result = await getPublishedSoftwareBySlug("useful-tool", client);

    expect(eq).toHaveBeenNthCalledWith(1, "slug", "useful-tool");
    expect(eq).toHaveBeenNthCalledWith(2, "publication_status", "published");
    expect(result).toMatchObject({
      status: "success",
      item: {
        name: "Useful Tool",
        vendor: { name: "Legacy Vendor" },
        hasFreePlan: false,
        hasFreeTrial: false,
      },
    });
  });

  it("returns not_found when RLS or the filters produce no visible row", async () => {
    const { client } = createClient({ data: null, error: null });

    await expect(getPublishedSoftwareBySlug("unpublished-or-missing", client)).resolves.toEqual({
      status: "not_found",
    });
  });

  it("returns a typed repository error", async () => {
    const error = {
      code: "PGRST000",
      message: "database unavailable",
      details: "internal details",
      hint: "internal hint",
      name: "PostgrestError",
    };
    const { client } = createClient({ data: null, error });

    await expect(getPublishedSoftwareBySlug("useful-tool", client)).resolves.toEqual({
      status: "error",
      error: {
        code: "PGRST000",
        message: "database unavailable",
        details: "internal details",
        hint: "internal hint",
      },
    });
  });
});

describe("listPublishedSoftwareByIds", () => {
  it("retains the published-only filter for category software", async () => {
    const { client, eq, inFilter } = createClient({ data: [publishedRow], error: null });

    const result = await listPublishedSoftwareByIds(["software-1"], client);

    expect(inFilter).toHaveBeenCalledWith("software_id", ["software-1"]);
    expect(eq).toHaveBeenCalledWith("publication_status", "published");
    expect(result.status).toBe("success");
  });
});

describe("listPublishedSoftwareMatching", () => {
  it("searches only the approved fields with an escaped case-insensitive pattern", async () => {
    const { client, eq, or } = createClient({ data: [publishedRow], error: null });

    const result = await listPublishedSoftwareMatching({ query: 'project, 100% "fit"' }, client);

    expect(eq).toHaveBeenCalledWith("publication_status", "published");
    expect(or).toHaveBeenCalledWith(
      'software_name.ilike."%project, 100\\% \\"fit\\"%",short_description.ilike."%project, 100\\% \\"fit\\"%",vendor.ilike."%project, 100\\% \\"fit\\"%",best_for.ilike."%project, 100\\% \\"fit\\"%"',
    );
    expect(result.status).toBe("success");
  });
});
