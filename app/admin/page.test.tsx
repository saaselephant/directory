import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminDashboard: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/repositories/admin", () => ({
  getAdminDashboard: mocks.getAdminDashboard,
}));
vi.mock("./admin-dashboard", () => ({ AdminDashboard: () => null }));

import AdminPage from "./page";

describe("AdminPage access boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects unauthenticated visitors to sign-in", async () => {
    mocks.requireAdmin.mockResolvedValue({ status: "unauthenticated" });
    await expect(AdminPage()).rejects.toThrow("REDIRECT:/admin/sign-in");
    expect(mocks.getAdminDashboard).not.toHaveBeenCalled();
  });

  it("does not load admin data for an authenticated non-admin", async () => {
    mocks.requireAdmin.mockResolvedValue({ status: "forbidden" });
    const page = await AdminPage();
    expect(page.props.children).toBeTruthy();
    expect(mocks.getAdminDashboard).not.toHaveBeenCalled();
  });

  it("loads the dashboard only for an authorized administrator", async () => {
    const client = { marker: "user-scoped-client" };
    mocks.requireAdmin.mockResolvedValue({ status: "authorized", client });
    mocks.getAdminDashboard.mockResolvedValue({
      status: "success",
      dashboard: {
        summary: {},
        softwareInReview: [],
        softwarePublished: [],
        categoriesInReview: [],
        categoriesPublished: [],
      },
    });
    await AdminPage();
    expect(mocks.getAdminDashboard).toHaveBeenCalledWith(client);
  });

  it.each([
    ["verified", "Software verified."],
    ["reopened", "Software returned to verification."],
    ["verification_invalid", "Verification data was invalid."],
    ["verification_stale", "The item changed before this action completed."],
    ["verification_unavailable", "Verification is unavailable."],
  ])("renders only fixed verification feedback for %s", async (result, message) => {
    mocks.requireAdmin.mockResolvedValue({ status: "authorized", client: {} });
    mocks.getAdminDashboard.mockResolvedValue({
      status: "success",
      dashboard: {
        summary: {},
        softwareInReview: [],
        softwarePublished: [],
        categoriesInReview: [],
        categoriesPublished: [],
      },
    });
    const page = await AdminPage({ searchParams: Promise.resolve({ result }) });
    expect(renderToStaticMarkup(page)).toContain(message);
  });
});
