import { afterEach, describe, expect, it, vi } from "vitest";
import { publicMetadata, siteOrigin } from "./site";
afterEach(() => vi.unstubAllEnvs());
describe("canonical origin", () => {
  it("preserves the existing host by default", () => {
    vi.stubEnv("SITE_URL", undefined);
    expect(siteOrigin()).toBe("https://saaselephant.com");
  });
  it("uses the configured origin consistently", () => {
    vi.stubEnv("SITE_URL", "https://apps.saaselephant.com");
    expect(publicMetadata("Software", "Directory", "/software").alternates?.canonical).toBe(
      "https://apps.saaselephant.com/software",
    );
  });
  it.each([
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com/path",
    "https://example.com/?q=x",
  ])("rejects a non-origin value %s", (url) => {
    vi.stubEnv("SITE_URL", url);
    expect(siteOrigin).toThrow();
  });
});
