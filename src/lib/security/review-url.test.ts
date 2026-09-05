import { describe, expect, it } from "vitest";
import { safeReviewUrl } from "./review-url";

describe("private review URL validation", () => {
  it.each([
    "https://slack.com",
    "https://docs.vendor.example/path?q=1#reference",
    "HTTPS://Vendor.Example:443/docs",
  ])("accepts an absolute HTTPS DNS URL: %s", (value) => {
    expect(safeReviewUrl(value)).toBe(new URL(value).href);
  });
  it.each([
    null,
    "",
    "Generated after approval",
    "http://vendor.example",
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///tmp/test",
    "//vendor.example",
    "/relative",
    "https://user:password@vendor.example",
    "https://user@vendor.example",
    "https://@vendor.example",
    "https:///vendor.example",
    "https://",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "https://-bad.example",
    "https://bad_.example",
    "https://vendor.example.",
    "https://vendor..example",
    "https://vendor.example:99999",
    "https://vendor.example\\evil",
    "https://vendor.example/\npath",
    " https://vendor.example",
    "https://" + "a".repeat(64) + ".example",
    "https://vendor.example/" + "x".repeat(2048),
  ])("keeps malformed or unsafe values inert: %s", (value) => {
    expect(safeReviewUrl(value)).toBeNull();
  });
});
