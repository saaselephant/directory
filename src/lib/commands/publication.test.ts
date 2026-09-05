import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));
const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin }));

import { isPublishableEntity, isPublicationTarget, setPublicationStatus } from "./publication";

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

  it("accepts only reviewed entities and target states", () => {
    expect(isPublishableEntity("software")).toBe(true);
    expect(isPublishableEntity("category")).toBe(true);
    expect(isPublishableEntity("affiliate_links")).toBe(false);
    expect(isPublicationTarget("published")).toBe(true);
    expect(isPublicationTarget("in_review")).toBe(true);
    expect(isPublicationTarget("draft")).toBe(false);
    expect(isPublicationTarget("archived")).toBe(false);
  });

  it.each([
    ["software", "published", "in_review", "software"],
    ["software", "in_review", "published", "software"],
    ["category", "published", "in_review", "categories"],
    ["category", "in_review", "published", "categories"],
  ] as const)(
    "updates %s to %s from its expected state",
    async (entity, target, previous, table) => {
      const { client, from, update, eq } = createAuthorizedClient();
      await expect(setPublicationStatus(entity, `${entity}-1`, target, client)).resolves.toEqual({
        status: "success",
      });
      expect(requireAdmin).toHaveBeenCalledWith(client);
      expect(from).toHaveBeenCalledWith(table);
      expect(update).toHaveBeenCalledWith({ publication_status: target });
      expect(eq).toHaveBeenCalledWith("publication_status", previous);
    },
  );

  it.each(["unauthenticated", "forbidden"] as const)(
    "denies %s without mutation",
    async (status) => {
      requireAdmin.mockResolvedValue({ status });
      const client = { from: vi.fn() } as unknown as SupabaseClient<Database>;
      await expect(
        setPublicationStatus("category", "category-1", "published", client),
      ).resolves.toEqual({ status });
      expect(client.from).not.toHaveBeenCalled();
    },
  );

  it("rejects an unexpected runtime entity before authorization", async () => {
    const client = { from: vi.fn() } as unknown as SupabaseClient<Database>;
    await expect(
      setPublicationStatus("affiliate_links", "link-1", "published", client),
    ).resolves.toEqual({ status: "invalid_transition" });
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  it.each([
    ["", "published"],
    ["x".repeat(201), "published"],
    ["software-1", "draft"],
  ] as const)("rejects invalid id or target", async (id, target) => {
    const client = { from: vi.fn() } as unknown as SupabaseClient<Database>;
    await expect(
      setPublicationStatus("software", id, target as "published", client),
    ).resolves.toEqual({ status: "invalid_transition" });
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("returns invalid_transition for a stale state", async () => {
    const { client } = createAuthorizedClient(null);
    await expect(
      setPublicationStatus("software", "software-1", "published", client),
    ).resolves.toEqual({ status: "invalid_transition" });
  });
});
