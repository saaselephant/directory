import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));

import { requireAdmin } from "./admin";

function createClient(
  user: User | null,
  role: { user_id: string } | null,
  roleError: unknown = null,
) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: role, error: roleError });
  const is = vi.fn(() => ({ maybeSingle }));
  const eq = vi.fn();
  const query = { eq, is };
  eq.mockReturnValue(query);
  const select = vi.fn(() => query);
  const from = vi.fn(() => ({ select }));
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null });

  return {
    client: { auth: { getUser }, from } as unknown as SupabaseClient<Database>,
    from,
    eq,
  };
}

describe("requireAdmin", () => {
  it("denies unauthenticated access without querying roles", async () => {
    const { client, from } = createClient(null, null);
    await expect(requireAdmin(client)).resolves.toEqual({ status: "unauthenticated" });
    expect(from).not.toHaveBeenCalled();
  });

  it("denies an authenticated user without an active platform_admin role", async () => {
    const user = { id: "user-1" } as User;
    const { client, eq } = createClient(user, null);
    await expect(requireAdmin(client)).resolves.toEqual({ status: "forbidden" });
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(eq).toHaveBeenCalledWith("role", "platform_admin");
  });

  it("denies a revoked platform administrator because no active role is RLS-visible", async () => {
    const user = { id: "user-1" } as User;
    const { client, eq } = createClient(user, null);
    await expect(requireAdmin(client)).resolves.toEqual({ status: "forbidden" });
    expect(eq).toHaveBeenCalledWith("role", "platform_admin");
  });

  it("allows an authenticated user through a database-backed active role", async () => {
    const user = { id: "user-1" } as User;
    const { client } = createClient(user, { user_id: "user-1" });
    const result = await requireAdmin(client);
    expect(result).toMatchObject({ status: "authorized", user });
  });
});
