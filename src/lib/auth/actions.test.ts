import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/types/database";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireAdmin: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/server", () => ({
  createAuthenticatedServerSupabaseClient: mocks.createClient,
}));

import { signInAdmin, signOutAdmin } from "./actions";

function form(email?: string, password?: string) {
  const data = new FormData();
  if (email !== undefined) data.set("email", email);
  if (password !== undefined) data.set("password", password);
  return data;
}

function authClient(signInError: unknown = null) {
  const signInWithPassword = vi.fn().mockResolvedValue({ error: signInError });
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const client = {
    auth: { signInWithPassword, signOut },
  } as unknown as SupabaseClient<Database>;
  mocks.createClient.mockResolvedValue(client);
  return { client, signInWithPassword, signOut };
}

describe("admin authentication actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects missing credentials before creating a client", async () => {
    await expect(signInAdmin(form("", ""))).rejects.toThrow(
      "REDIRECT:/admin/sign-in?error=authentication",
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns the same generic result for invalid credentials", async () => {
    const { signInWithPassword } = authClient({ message: "account-specific detail" });
    await expect(signInAdmin(form("person@example.com", "wrong"))).rejects.toThrow(
      "REDIRECT:/admin/sign-in?error=authentication",
    );
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "person@example.com",
      password: "wrong",
    });
  });

  it("signs out a successfully authenticated non-admin", async () => {
    const { client, signOut } = authClient();
    mocks.requireAdmin.mockResolvedValue({ status: "forbidden" });
    await expect(signInAdmin(form("person@example.com", "password"))).rejects.toThrow(
      "REDIRECT:/admin/sign-in?error=unavailable",
    );
    expect(mocks.requireAdmin).toHaveBeenCalledWith(client);
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("signs out a revoked administrator represented by no active role", async () => {
    const { signOut } = authClient();
    mocks.requireAdmin.mockResolvedValue({ status: "forbidden" });
    await expect(signInAdmin(form("revoked@example.com", "password"))).rejects.toThrow(
      "REDIRECT:/admin/sign-in?error=unavailable",
    );
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("redirects an active platform administrator to the fixed admin route", async () => {
    authClient();
    mocks.requireAdmin.mockResolvedValue({ status: "authorized" });
    await expect(signInAdmin(form("admin@example.com", "password"))).rejects.toThrow(
      "REDIRECT:/admin",
    );
    expect(mocks.redirect).not.toHaveBeenCalledWith(expect.stringContaining("http"));
  });

  it("signs out through Supabase and redirects to the fixed sign-in route", async () => {
    const { signOut } = authClient();
    await expect(signOutAdmin()).rejects.toThrow("REDIRECT:/admin/sign-in");
    expect(signOut).toHaveBeenCalledOnce();
  });
});
