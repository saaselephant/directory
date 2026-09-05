import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PublicLayout from "./layout";

describe("public application shell", () => {
  it("renders internal public navigation without advertising Admin", () => {
    const html = renderToStaticMarkup(
      <PublicLayout>
        <main>Route content</main>
      </PublicLayout>,
    );

    expect(html).toContain('aria-label="Primary navigation"');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/software"');
    expect(html).toContain('href="/categories"');
    expect(html).toContain("Route content");
    expect(html).toContain(String(new Date().getFullYear()));
    expect(html).toContain("Skip to content");
    expect(html).toContain("through certain links, at no additional cost to you");
    expect(html).not.toMatch(/href="\/admin|Admin preview/);
  });

  it("structurally wraps all public routes and leaves admin routes outside", () => {
    const publicRoot = join(process.cwd(), "app", "(public)");
    for (const route of [
      "page.tsx",
      join("software", "page.tsx"),
      join("software", "[slug]", "page.tsx"),
      join("categories", "page.tsx"),
      join("categories", "[slug]", "page.tsx"),
    ]) {
      expect(existsSync(join(publicRoot, route))).toBe(true);
    }
    expect(existsSync(join(publicRoot, "admin"))).toBe(false);
    expect(existsSync(join(process.cwd(), "app", "admin", "page.tsx"))).toBe(true);
  });

  it("keeps navigation visible and keyboard focusable at narrow widths", () => {
    const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
    expect(css).toMatch(/\.public-nav,\s*\.public-footer\s*\{[^}]*display: flex/s);
    expect(css).toMatch(/\.public-nav a:focus-visible[^}]*outline:/s);
    expect(css).not.toMatch(
      /\.public-(?:header|nav)[^{]*\{[^}]*(?:display:\s*none|visibility:\s*hidden)/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 36rem\)[\s\S]*\.public-nav,\s*\.public-footer\s*\{[^}]*align-items: flex-start/s,
    );
  });
});
