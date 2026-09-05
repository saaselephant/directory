import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getConfig: vi.fn(() => ({
    url: "https://example.supabase.co",
    publishableKey: "test-publishable-key",
  })),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@/lib/config/env", () => ({ getPublicSupabaseConfig: mocks.getConfig }));

import { refreshAdminSession } from "./proxy";

describe("refreshAdminSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates the session and persists refreshed cookies without role queries", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: null });
    mocks.createServerClient.mockImplementation((_url, _key, options) => ({
      auth: {
        getUser: async () => {
          options.cookies.setAll([
            {
              name: "sb-session",
              value: "refreshed",
              options: { httpOnly: true, path: "/" },
            },
          ]);
          return getUser();
        },
      },
    }));

    const response = await refreshAdminSession(new NextRequest("https://example.com/admin"));

    expect(getUser).toHaveBeenCalledOnce();
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "test-publishable-key",
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
    expect(mocks.createServerClient.mock.results[0]?.value).not.toHaveProperty("from");
  });
});
