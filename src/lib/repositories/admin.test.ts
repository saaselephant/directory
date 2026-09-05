import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));

import { getAdminDashboard } from "./admin";

function createClient(fail = false) {
  const from = vi.fn((table: "software" | "categories") => ({
    select: vi.fn((columns: string, options?: { head?: boolean }) => {
      if (options?.head) {
        return {
          eq: vi.fn((_column: string, value: string) =>
            Promise.resolve({
              count: value === "in_review" ? (table === "software" ? 43 : 43) : 0,
              error: fail ? { code: "PGRST000", message: "private failure" } : null,
            }),
          ),
        };
      }

      const state = table === "software" ? undefined : undefined;
      const data = columns.includes("software_name")
        ? [
            {
              software_id: "software-1",
              slug: "tool",
              software_name: "Tool",
              vendor: "Vendor",
              publication_status: state ?? "in_review",
              verification_status: "needs_verification",
            },
          ]
        : [
            {
              category_id: "category-1",
              slug: "crm",
              category_name: "CRM",
              publication_status: state ?? "in_review",
            },
          ];
      return {
        eq: vi.fn((_column: string, stateValue: string) => ({
          order: vi.fn(() => ({
            overrideTypes: vi.fn().mockResolvedValue({
              data: data.map((row) => ({ ...row, publication_status: stateValue })),
              error: null,
            }),
          })),
        })),
      };
    }),
  }));
  return { from, client: { from } as unknown as SupabaseClient<Database> };
}

describe("admin repository", () => {
  it("builds summary and review-queue application models", async () => {
    const result = await getAdminDashboard(createClient().client);
    expect(result).toMatchObject({
      status: "success",
      dashboard: {
        summary: { softwareInReview: 43, categoriesInReview: 43 },
        softwareInReview: [{ name: "Tool", vendorName: "Vendor", publicationStatus: "in_review" }],
        softwarePublished: [{ name: "Tool", publicationStatus: "published" }],
        categoriesInReview: [{ name: "CRM", publicationStatus: "in_review" }],
        categoriesPublished: [{ name: "CRM", publicationStatus: "published" }],
      },
    });
  });

  it("selects only the restricted admin fields and no affiliate tables", async () => {
    const { client, from } = createClient();
    await getAdminDashboard(client);
    expect(from).not.toHaveBeenCalledWith("affiliate_programs");
    expect(from).not.toHaveBeenCalledWith("affiliate_links");
    expect(from).not.toHaveBeenCalledWith("user_roles");
    const selectedColumns = from.mock.results
      .map((result) => result.value.select.mock.calls)
      .flat()
      .map((call) => call[0])
      .filter((value) => typeof value === "string");
    expect(selectedColumns.some((columns) => columns.includes("verification_status"))).toBe(true);
    expect(selectedColumns.every((columns) => !columns.includes("verified_at"))).toBe(true);
  });

  it("returns a typed error without throwing database details", async () => {
    await expect(getAdminDashboard(createClient(true).client)).resolves.toEqual({
      status: "error",
      error: { code: "PGRST000", message: "private failure" },
    });
  });
});
