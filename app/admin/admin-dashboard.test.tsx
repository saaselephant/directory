import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { CategoryId, SoftwareId } from "@/types/models";

vi.mock("server-only", () => ({}));

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
          softwareInReview: [
            {
              id: "software-secret-id" as SoftwareId,
              slug: "tool",
              name: "Tool",
              vendorName: "Vendor",
              publicationStatus: "in_review",
              verificationStatus: "needs_verification",
            },
          ],
          softwarePublished: [
            {
              id: "software-published-id" as SoftwareId,
              slug: "published-tool",
              name: "Published Tool",
              vendorName: "Vendor",
              publicationStatus: "published",
              verificationStatus: "verified",
            },
          ],
          categoriesInReview: [
            {
              id: "category-secret-id" as CategoryId,
              slug: "crm",
              name: "CRM",
              publicationStatus: "in_review",
            },
          ],
          categoriesPublished: [
            {
              id: "category-published-id" as CategoryId,
              slug: "published-crm",
              name: "Published CRM",
              publicationStatus: "published",
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Software awaiting review");
    expect(html).toContain("Software published");
    expect(html).toContain("Categories awaiting review");
    expect(html).toContain("Categories published");
    expect(html).toContain("needs verification");
    expect(html).toContain("Publish");
    expect(html).toContain("Return to review");
    expect(html.match(/class="admin-publication-form"/g)).toHaveLength(4);
    expect(html.match(/class="admin-action-button"/g)).toHaveLength(5);
    expect(html.match(/>Publish<\/button>/g)).toHaveLength(2);
    expect(html.match(/>Return to review<\/button>/g)).toHaveLength(2);
    expect(html).not.toContain(">software-secret-id<");
    expect(html).not.toContain(">category-secret-id<");
    expect(html).not.toContain("checkbox");
    expect(html).not.toContain("Delete");
    expect(html).not.toContain("Edit verification");
    expect(html).not.toContain("role control");
    expect(html).not.toContain("affiliate");
  });

  it("keeps admin actions on the visible, keyboard-focusable style contract", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toContain("--navy: #123a73");
    expect(css).toMatch(/\.admin-action-button\s*\{[^}]*background: var\(--navy\)/s);
    expect(css).toMatch(/\.admin-action-button\s*\{[^}]*color: white/s);
    expect(css).toMatch(/\.admin-action-button\s*\{[^}]*display: inline-flex/s);
    expect(css).toMatch(/\.admin-action-button:focus-visible\s*\{[^}]*outline:/s);
    expect(css).toMatch(/\.admin-action-button:disabled\s*\{[^}]*color: white/s);
  });
});
