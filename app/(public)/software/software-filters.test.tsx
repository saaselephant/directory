import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SoftwareFilters } from "./software-filters";

describe("SoftwareFilters", () => {
  it("renders a URL-driven GET form with public category slugs", () => {
    const html = renderToStaticMarkup(
      <SoftwareFilters
        categories={{
          status: "success",
          categories: [
            { slug: "project-management", name: "Project Management", description: null },
          ],
        }}
        filters={{ query: "project", categorySlug: "project-management" }}
      />,
    );

    expect(html).toContain('method="get"');
    expect(html).toContain('action="/software"');
    expect(html).toContain('name="q"');
    expect(html).toContain('name="category"');
    expect(html).toContain('value="project-management"');
    expect(html).toContain('href="/software"');
    expect(html).not.toContain("category_id");
    expect(html).not.toContain("affiliate");
  });

  it("renders no database-derived options when no categories are public", () => {
    const html = renderToStaticMarkup(
      <SoftwareFilters
        categories={{ status: "empty", categories: [] }}
        filters={{ query: "", categorySlug: "" }}
      />,
    );

    expect(html).toContain("All categories");
    expect(html.match(/<option/g)).toHaveLength(1);
  });
});
