import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));
const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin }));

import { isPublicationTarget, setPublicationStatus } from "./publication";

function createAuthorizedClient(data: unknown = { software_id: "software-1" }) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  const select = vi.fn(() => ({ maybeSingle }));
  const eq = vi.fn();
  const query = { eq, select };
  eq.mockReturnValue(query);
  const update = vi.fn(() => query);
  const from = vi.fn(() => ({ update }));
  const client = { from } as unknown as SupabaseClient<Database>;
  requireAdmin.mockResolvedValue({ status: "authorized", client, user: { id: "user-1" } });
  return { client, from, update, eq };
}

describe("publication commands", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts only the two reviewed target states", () => {
    expect(isPublicationTarget("published")).toBe(true);
    expect(isPublicationTarget("in_review")).toBe(true);
    expect(isPublicationTarget("draft")).toBe(false);
    expect(isPublicationTarget("archived")).toBe(false);
  });

  it("publishes software only from in_review with a fixed payload", async () => {
    const { client, from, update, eq } = createAuthorizedClient();
    await expect(
      setPublicationStatus("software", "software-1", "published", client),
    ).resolves.toEqual({ status: "success" });
    expect(from).toHaveBeenCalledWith("software");
    expect(update).toHaveBeenCalledWith({ publication_status: "published" });
    expect(eq).toHaveBeenCalledWith("publication_status", "in_review");
  });

  it("returns the authorization denial without issuing an update", async () => {
    requireAdmin.mockResolvedValue({ status: "forbidden" });
    const client = { from: vi.fn() } as unknown as SupabaseClient<Database>;
    await expect(
      setPublicationStatus("category", "category-1", "published", client),
    ).resolves.toEqual({ status: "forbidden" });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("rejects invalid input and stale or invalid transitions safely", async () => {
    const { client } = createAuthorizedClient(null);
    await expect(
      setPublicationStatus("software", "software-1", "in_review", client),
    ).resolves.toEqual({ status: "invalid_transition" });
    await expect(setPublicationStatus("software", "", "published", client)).resolves.toEqual({
      status: "invalid_transition",
    });
  });
});
