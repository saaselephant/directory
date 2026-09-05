import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("public homepage", () => {
  it("keeps software discovery and does not advertise Admin", () => {
    const html = renderToStaticMarkup(<HomePage />);
    expect(html).toContain('href="/software"');
    expect(html).toContain("Browse software");
    expect(html).not.toContain('href="/admin"');
    expect(html).not.toContain("Admin preview");
  });
});
