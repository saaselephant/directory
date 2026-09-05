import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicNavigation } from "./public-navigation";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

describe("public navigation", () => {
  it.each([
    ["/", "Home"],
    ["/software", "Software"],
    ["/software/pipedrive", "Software"],
    ["/categories/crm", "Categories"],
  ])("marks the current section for %s", (pathname, label) => {
    route.pathname = pathname;
    const html = renderToStaticMarkup(<PublicNavigation />);
    expect(html).toMatch(new RegExp('aria-current="page"[^>]*>' + label));
    expect(html.match(/aria-current/g)).toHaveLength(1);
    expect(html).not.toContain("/admin");
  });
});
