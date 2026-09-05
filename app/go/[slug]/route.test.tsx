import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@/lib/repositories/outbound", () => ({ resolveSoftwareOutbound: mocks.resolve }));
import { GET } from "./route";
describe("public /go route", () => {
  beforeEach(() => vi.clearAllMocks());
  it("ignores caller destination, callback and analytics parameters", async () => {
    mocks.resolve.mockResolvedValue("https://vendor.example/");
    const response = await GET(
      new Request(
        "https://site.example/go/tool?destination=https://attacker.example&callback=x&analytics=fail",
      ),
      { params: Promise.resolve({ slug: "tool" }) },
    );
    expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith("tool");
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("https://vendor.example/");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(await response.text()).toBe("");
  });
  it("returns an inert unavailable response without internal diagnostics", async () => {
    mocks.resolve.mockResolvedValue(null);
    const response = await GET(new Request("https://site.example/go/missing"), {
      params: Promise.resolve({ slug: "missing" }),
    });
    expect(response.status).toBe(404);
    expect(response.headers.has("Location")).toBe(false);
    expect(await response.text()).toBe("This software link is unavailable.");
  });
});
