import { describe, expect, it, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({ from: mocks.from }),
}));
import sitemap from "./sitemap";

describe("published sitemap", () => {
  beforeEach(() => vi.unstubAllEnvs());
  it("paginates beyond the first batch and includes only public route families", async () => {
    const ranges: number[] = [];
    mocks.from.mockImplementation((table: string) => {
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: (_from: number) => {
          ranges.push(_from);
          return {
            overrideTypes: async () => ({
              error: null,
              data:
                table === "categories"
                  ? [{ slug: "crm" }]
                  : _from === 0
                    ? Array.from({ length: 500 }, (_, i) => ({ slug: `tool-${i}` }))
                    : [{ slug: "last-tool" }],
            }),
          };
        },
      };
      return query;
    });
    const result = await sitemap();
    expect(result).toHaveLength(508);
    expect(result).toContainEqual({ url: "https://saaselephant.com/software/last-tool" });
    expect(ranges).toEqual([0, 0, 500]);
    expect(result.some((item) => /\/admin|\/go\//.test(item.url))).toBe(false);
  });
  it("fails rather than serving a partial sitemap after a database error", async () => {
    mocks.from.mockImplementation(() => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      order() {
        return this;
      },
      range() {
        return this;
      },
      overrideTypes: async () => ({ data: null, error: { message: "private diagnostic" } }),
    }));
    await expect(sitemap()).rejects.toThrow("Unable to generate published categories sitemap.");
  });
});
