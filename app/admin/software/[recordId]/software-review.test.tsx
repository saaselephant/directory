import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SoftwareReview, SoftwareReviewEvent } from "@/types/models";
import { SoftwareReviewDetail } from "./software-review";
const review: SoftwareReview = {
  id: "SE025",
  name: "Slack",
  slug: "slack",
  vendorName: "Slack Technologies",
  legacyVendor: "Slack",
  websiteUrl: "https://slack.com",
  shortDescription: "Messaging",
  fullDescription: "Team communications",
  bestFor: "Teams",
  pricing: null,
  freePlan: true,
  freeTrial: null,
  publicationStatus: "in_review",
  verificationStatus: "verified",
  verifiedAt: "2026-09-05T10:00:00Z",
  categories: [
    { id: "CAT105", name: "Communication", slug: "communication", publicationStatus: "in_review" },
  ],
};
const event: SoftwareReviewEvent = {
  result: "verified",
  verifiedAt: "2026-09-05T10:00:00Z",
  sourceUrl: "https://slack.com/help",
  sourceReference: "Help",
  notes: "Checked",
  reason: null,
};
function render(item = review, events = [event]) {
  return renderToStaticMarkup(
    <SoftwareReviewDetail review={item} history={{ status: "success", events }} />,
  );
}
describe("private software review presentation", () => {
  it("shows catalogue facts, context and safe links without new mutation controls", () => {
    const html = render();
    for (const value of [
      "Slack Technologies",
      "Legacy vendor",
      "Team communications",
      "Communication",
      "in review",
      "Verified",
      "Not recorded",
    ])
      expect(html).toContain(value);
    expect(html).toContain('href="https://slack.com/"');
    expect(html).toContain('href="https://slack.com/help"');
    expect(html).toContain('href="/admin"');
    expect(html).not.toContain("<form");
    expect(html).not.toMatch(/affiliate|actor|Certified|Approved|Guaranteed|Endorsed/);
  });
  it.each([
    "javascript:alert(1)",
    "https://user:pass@vendor.example",
    "Generated after approval",
    "//vendor.example",
  ])("renders invalid website/evidence inert: %s", (url) => {
    const html = render({ ...review, websiteUrl: url }, [{ ...event, sourceUrl: url }]);
    expect(html.match(/Invalid URL/g)).toHaveLength(2);
    expect(html.match(/href=/g)).toHaveLength(1);
  });
  it("escapes notes and reopening reasons as text", () => {
    const html = render(review, [
      {
        ...event,
        notes: "<script>alert(1)</script>",
        result: "needs_verification",
        sourceUrl: null,
        sourceReference: null,
        reason: "<img src=x onerror=alert(1)>",
      },
    ]);
    expect(html).toContain("Returned to verification");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).not.toMatch(/<script|<img|Evidence URL/);
  });
  it("distinguishes empty history from a failed history read", () => {
    expect(render(review, [])).toContain("No software catalogue verification history recorded");
    const html = renderToStaticMarkup(
      <SoftwareReviewDetail review={review} history={{ status: "error" }} />,
    );
    expect(html).toContain("Verification history is unavailable");
    expect(html).not.toContain("No software catalogue verification history");
  });
  it("renders neutral event labels in given order", () => {
    const html = render(
      review,
      ["verified", "needs_verification", "failed", "stale", "pending"].map((result) => ({
        ...event,
        result: result as SoftwareReviewEvent["result"],
      })),
    );
    const labels = ["Verified", "Needs verification", "Failed", "Stale", "Pending"];
    const positions = labels.map((label) => html.indexOf("<h3>" + label));
    expect(
      positions.every(
        (position, index) => position >= 0 && (index === 0 || position > positions[index - 1]),
      ),
    ).toBe(true);
  });
  it("shows absent categories and missing optional facts explicitly", () => {
    expect(
      render({
        ...review,
        categories: [],
        websiteUrl: null,
        vendorName: null,
        fullDescription: null,
      }),
    ).toContain("No assigned categories");
  });
});
