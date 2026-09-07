import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicNavigation } from "./public-navigation";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

describe("public navigation", () => {
  it.each([
    ["/software", "All Softwares"],
    ["/software/pipedrive", "All Softwares"],
    ["/categories/crm", "Categories"],
  ])("marks the current section for %s", (pathname, label) => {
    route.pathname = pathname;
    const html = renderToStaticMarkup(<PublicNavigation />);
    expect(html).toMatch(new RegExp('aria-current="page"[^>]*>' + label));
    expect(html.match(/aria-current/g)).toHaveLength(1);
    expect(html).not.toContain("/admin");
  });

  it("uses published category disclosures and does not render a separate Home action", () => {
    route.pathname = "/";
    const html = renderToStaticMarkup(
      <PublicNavigation
        categories={[{ slug: "crm", name: "CRM", description: null }]}
      />,
    );
    expect(html).toContain('aria-controls="category-menu-crm"');
    expect(html).toContain("All Softwares");
    expect(html).not.toContain(">Home<");
  });
});
