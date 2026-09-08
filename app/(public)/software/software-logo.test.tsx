import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SoftwareLogo } from "./software-logo";

describe("SoftwareLogo", () => {
  it("preserves the monogram fallback when no logo is available", () => {
    const html = renderToStaticMarkup(<SoftwareLogo name="Useful Tool" logo={null} />);

    expect(html).toContain("product-monogram");
    expect(html).toContain(">U<");
    expect(html).not.toContain("<img");
  });

  it("renders a resolved logo descriptor when one is supplied", () => {
    const html = renderToStaticMarkup(
      <SoftwareLogo
        name="Useful Tool"
        logo={{ src: "/software-logos/useful-tool.svg", alt: "Useful Tool logo" }}
      />,
    );

    expect(html).toContain('src="/software-logos/useful-tool.svg"');
    expect(html).toContain('alt="Useful Tool logo"');
    expect(html).not.toContain(">U<");
  });

  it("uses the monogram fallback for a blank resolved source", () => {
    const html = renderToStaticMarkup(
      <SoftwareLogo name="Useful Tool" logo={{ src: "  ", alt: "Useful Tool logo" }} />,
    );

    expect(html).toContain(">U<");
    expect(html).not.toContain("<img");
  });
});
