import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  review: vi.fn(),
  history: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error("REDIRECT:" + path);
  }),
}));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/repositories/software-review", () => ({
  getSoftwareReview: mocks.review,
  getSoftwareVerificationHistory: mocks.history,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./software-review", () => ({ SoftwareReviewDetail: () => <p>Private review content</p> }));
import Page, { dynamic, revalidate, metadata } from "./page";
const params = Promise.resolve({ recordId: "SE025" });

describe("private software review route", () => {
  beforeEach(() => vi.clearAllMocks());
  it("redirects unauthenticated callers before data lookup", async () => {
    mocks.requireAdmin.mockResolvedValue({ status: "unauthenticated" });
    await expect(Page({ params })).rejects.toThrow("REDIRECT:/admin/sign-in");
    expect(mocks.review).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
  });
  it.each(["ordinary user", "revoked administrator"])(
    "denies %s without testing record existence",
    async () => {
      mocks.requireAdmin.mockResolvedValue({ status: "forbidden" });
      const html = renderToStaticMarkup(await Page({ params }));
      expect(html).toContain("Access unavailable");
      expect(html).not.toContain("SE025");
      expect(mocks.review).not.toHaveBeenCalled();
      expect(mocks.history).not.toHaveBeenCalled();
    },
  );
  it("fails closed when authorization throws", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("secret auth error"));
    expect(renderToStaticMarkup(await Page({ params }))).toContain("Access unavailable");
    expect(mocks.review).not.toHaveBeenCalled();
  });
  it("uses the authorized user client for both reads", async () => {
    const client = { userScoped: true };
    mocks.requireAdmin.mockResolvedValue({ status: "authorized", client });
    mocks.review.mockResolvedValue({ status: "success", review: {} });
    mocks.history.mockResolvedValue({ status: "success", events: [] });
    expect(renderToStaticMarkup(await Page({ params }))).toContain("Private review content");
    expect(mocks.review).toHaveBeenCalledWith("SE025", client);
    expect(mocks.history).toHaveBeenCalledWith("SE025", client);
  });
  it.each(["not_found", "error"])("does not fetch history when review is %s", async (status) => {
    mocks.requireAdmin.mockResolvedValue({ status: "authorized", client: {} });
    mocks.review.mockResolvedValue({ status });
    const html = renderToStaticMarkup(await Page({ params }));
    expect(html).toContain("unavailable");
    expect(mocks.history).not.toHaveBeenCalled();
  });
  it("uses dynamic rendering and fixed non-indexable metadata", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(revalidate).toBe(0);
    expect(metadata).toEqual({
      title: "Private software review",
      robots: { index: false, follow: false },
    });
  });
});
