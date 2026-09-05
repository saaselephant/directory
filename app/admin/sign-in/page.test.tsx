import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  signInAdmin: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/auth/actions", () => ({ signInAdmin: mocks.signInAdmin }));

import AdminSignInPage from "./page";

describe("AdminSignInPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ status: "unauthenticated" });
  });

  it("renders email/password sign-in without registration or role controls", async () => {
    const html = renderToStaticMarkup(await AdminSignInPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain('class="admin-action-button"');
    expect(html).toContain(">Sign in</button>");
    expect(html).not.toMatch(/sign up|register|role selector|oauth/i);
  });

  it("renders only a generic authentication failure", async () => {
    const html = renderToStaticMarkup(
      await AdminSignInPage({
        searchParams: Promise.resolve({ error: "authentication" }),
      }),
    );
    expect(html).toContain("Sign-in is unavailable");
    expect(html).not.toContain("account-specific detail");
  });

  it("redirects an already authorized administrator to the fixed admin route", async () => {
    mocks.requireAdmin.mockResolvedValue({ status: "authorized" });
    await expect(AdminSignInPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/admin",
    );
  });
});
