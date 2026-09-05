import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ software: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/repositories/software", () => ({ getPublishedSoftwareBySlug: mocks.software }));
vi.mock("@/lib/config/env", () => ({
  getPublicSupabaseConfig: () => ({
    url: "https://project.example",
    publishableKey: "public-test-key",
  }),
}));
import { resolveSoftwareOutbound } from "./outbound";
const official = "https://vendor.example/";
describe("outbound navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.software.mockResolvedValue({ status: "success", item: { websiteUrl: official } });
  });
  afterEach(() => vi.unstubAllGlobals());
  it.each(["unpublished", "missing"])(
    "does not query affiliate resolution for %s software",
    async () => {
      mocks.software.mockResolvedValue({ status: "not_found" });
      expect(await resolveSoftwareOutbound("tool")).toBeNull();
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );
  it("uses only the fixed slug RPC, reads redirect headers manually and never sends credentials onward", async () => {
    mocks.fetch.mockResolvedValue(
      new Response(null, {
        status: 303,
        headers: { Location: "https://referral.vendor.example/real-link" },
      }),
    );
    expect(await resolveSoftwareOutbound("tool")).toBe("https://referral.vendor.example/real-link");
    const [url, options] = mocks.fetch.mock.calls[0];
    expect(String(url)).toBe("https://project.example/rest/v1/rpc/saaselephant_software_outbound");
    expect(options).toMatchObject({
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      headers: { apikey: "public-test-key", "Content-Type": "application/json" },
      body: JSON.stringify({ p_software_slug: "tool" }),
    });
    expect(options.headers).not.toHaveProperty("Authorization");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it("preserves the official fallback and rejects an unsafe affiliate Location", async () => {
    mocks.fetch.mockResolvedValue(
      new Response(null, { status: 303, headers: { Location: official } }),
    );
    expect(await resolveSoftwareOutbound("tool")).toBe(official);
    mocks.fetch.mockResolvedValue(
      new Response(null, { status: 303, headers: { Location: "javascript:alert(1)" } }),
    );
    expect(await resolveSoftwareOutbound("tool")).toBe(official);
  });
  it("uses a safe official fallback during missing-migration rollout or network failure", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ code: "PGRST202" }, { status: 404 }));
    expect(await resolveSoftwareOutbound("tool")).toBe(official);
    mocks.fetch.mockRejectedValue(new Error("private transport error"));
    expect(await resolveSoftwareOutbound("tool")).toBe(official);
  });
  it("does not override a database denial or concurrent unpublish with a stale fallback", async () => {
    for (const status of [401, 403, 404]) {
      mocks.fetch.mockResolvedValue(new Response(null, { status }));
      expect(await resolveSoftwareOutbound("tool")).toBeNull();
    }
  });
  it("rejects unsafe official fallback when no eligible destination is available", async () => {
    mocks.software.mockResolvedValue({
      status: "success",
      item: { websiteUrl: "https://user@vendor.example" },
    });
    mocks.fetch.mockRejectedValue(new Error("offline"));
    expect(await resolveSoftwareOutbound("tool")).toBeNull();
  });
  it("accepts an eligible destination even when no safe official website exists", async () => {
    mocks.software.mockResolvedValue({ status: "success", item: { websiteUrl: "" } });
    mocks.fetch.mockResolvedValue(
      new Response(null, {
        status: 303,
        headers: { Location: "https://referral.vendor.example/link" },
      }),
    );
    expect(await resolveSoftwareOutbound("tool")).toBe("https://referral.vendor.example/link");
  });
  it("rejects arbitrary URLs, query strings and oversized input before reads", async () => {
    for (const slug of [
      "https://attacker.example",
      "tool?url=https://attacker.example",
      "",
      "a".repeat(201),
    ]) {
      expect(await resolveSoftwareOutbound(slug)).toBeNull();
    }
    expect(mocks.software).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
