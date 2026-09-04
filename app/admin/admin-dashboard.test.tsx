import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CategoryId, SoftwareId } from "@/types/models";

import { AdminDashboard } from "./admin-dashboard";

describe("AdminDashboard", () => {
  it("renders summaries and queues without affiliate destinations or identifiers", () => {
    const html = renderToStaticMarkup(
      <AdminDashboard
        dashboard={{
          summary: {
            softwareInReview: 43,
            softwarePublished: 0,
            softwareNeedsVerification: 43,
            categoriesInReview: 43,
            categoriesPublished: 0,
          },
          softwareQueue: [
            {
              id: "software-secret-id" as SoftwareId,
              slug: "tool",
              name: "Tool",
              vendorName: "Vendor",
              publicationStatus: "in_review",
              verificationStatus: "needs_verification",
            },
          ],
          categoryQueue: [
            {
              id: "category-secret-id" as CategoryId,
              slug: "crm",
              name: "CRM",
              publicationStatus: "in_review",
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Software awaiting review");
    expect(html).toContain("Categories awaiting review");
    expect(html).toContain("needs verification");
    expect(html).not.toContain("software-secret-id");
    expect(html).not.toContain("category-secret-id");
    expect(html).not.toContain("affiliate");
  });
});
