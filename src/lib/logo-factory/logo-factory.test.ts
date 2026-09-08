import { describe, expect, it } from "vitest";

import {
  acquireProductLogo,
  classifyCandidate,
  discoverLogoCandidates,
  isSafePublicUrl,
  mapWithConcurrency,
  rejectSharedAssetCollisions,
  validateImage,
  type FetchResponse,
  type LogoFactoryProduct,
} from "./logo-factory";

const product: LogoFactoryProduct = {
  id: "software-1",
  slug: "useful-tool",
  name: "Useful Tool",
  websiteUrl: "https://useful.example/product",
  vendor: {
    id: "vendor-1",
    name: "Example Vendor",
    slug: "example-vendor",
    websiteUrl: "https://vendor.example",
  },
};

function png(width = 128, height = 128): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function response(
  url: string,
  contentType: string,
  bytes: Uint8Array,
  status = 200,
): FetchResponse {
  return { status, url, contentType, bytes };
}

describe("Logo Factory", () => {
  it("discovers explicit official product logos before favicons", () => {
    const result = discoverLogoCandidates(
      `<html><head><link rel="icon" sizes="192x192" href="/icon.png"></head>
       <body><header><img class="brand-logo" alt="Useful Tool logo" src="/useful-tool.png"></header></body></html>`,
      product.websiteUrl,
      product,
    );

    expect(result.candidates.map(({ url, kind }) => ({ url, kind }))).toEqual([
      { url: "https://useful.example/useful-tool.png", kind: "logo_image" },
      { url: "https://useful.example/icon.png", kind: "favicon" },
    ]);
  });

  it("does not treat the official hostname as identity evidence for unrelated imagery", () => {
    const result = discoverLogoCandidates(
      `<html><img alt="Team collaboration" src="/images/feature-screen.png">
       <img class="client-logo" alt="Customer" src="/images/pnc.png"></html>`,
      product.websiteUrl,
      product,
    );

    expect(result.candidates).toEqual([]);
  });

  it("does not accept a feature image merely because its alt text mentions the product logo", () => {
    const result = discoverLogoCandidates(
      `<img class="usecase-image" src="/images/laptop-canary.png"
        alt="Laptop with an image of Useful Tool logo">`,
      product.websiteUrl,
      product,
    );

    expect(result.candidates).toEqual([]);
  });

  it("uses logos only from recognized structured-data entities", () => {
    const result = discoverLogoCandidates(
      `<script type="application/ld+json">
        {"@graph":[
          {"@type":"Organization","name":"Useful Tool","logo":"/useful-logo.png"},
          {"@type":"Person","name":"Customer","logo":"/customer.png"}
        ]}
      </script>`,
      product.websiteUrl,
      product,
    );

    expect(result.candidates).toEqual([
      expect.objectContaining({
        url: "https://useful.example/useful-logo.png",
        kind: "structured_logo",
      }),
    ]);
  });

  it("rejects a generic vendor logo for a sibling product on the vendor domain", () => {
    const sibling = {
      ...product,
      websiteUrl: "https://vendor.example/products/useful",
    };
    expect(
      classifyCandidate(
        {
          url: "https://cdn.example/vendor-logo.png",
          kind: "logo_image",
          score: 80,
          evidence: "brand logo",
        },
        sibling,
      ),
    ).toBeNull();
  });

  it("does not use CDN directories or query strings as product identity evidence", () => {
    expect(
      classifyCandidate(
        {
          url: "https://cdn.example/useful-tool/_next/image?url=useful.example/customer.png",
          kind: "logo_image",
          score: 80,
          evidence: "brand logo",
        },
        product,
      ),
    ).toBeNull();
  });

  it("does not collapse sibling products through a shared vendor token", () => {
    const sibling = {
      ...product,
      name: "Example Analytics",
      slug: "example-analytics",
      websiteUrl: "https://vendor.example/analytics",
    };
    expect(
      classifyCandidate(
        {
          url: "https://cdn.example/example-favicon.png",
          kind: "favicon",
          score: 60,
          evidence: "link rel=icon",
        },
        sibling,
      ),
    ).toBeNull();
  });

  it("accepts a representative favicon from a distinct official product domain", () => {
    expect(
      classifyCandidate(
        {
          url: "https://useful.example/icon.png",
          kind: "favicon",
          score: 60,
          evidence: "link rel=icon",
        },
        product,
      ),
    ).toBe("favicon");
  });

  it("rejects private, non-HTTPS and credential-bearing URLs", () => {
    expect(isSafePublicUrl("https://example.com")).toBe(true);
    expect(isSafePublicUrl("http://example.com")).toBe(false);
    expect(isSafePublicUrl("https://127.0.0.1/logo.png")).toBe(false);
    expect(isSafePublicUrl("https://user:secret@example.com/logo.png")).toBe(false);
  });

  it("validates supported image signatures, dimensions and aspect ratios", () => {
    expect(validateImage(png(), "image/png")).toMatchObject({
      extension: "png",
      width: 128,
      height: 128,
    });
    expect(validateImage(png(1, 1), "image/png")).toBeNull();
    expect(validateImage(png(1200, 32), "image/png")).toBeNull();
    expect(validateImage(new Uint8Array([1, 2, 3]), "image/png")).toBeNull();
    expect(validateImage(png(), "image/svg+xml")).toBeNull();
  });

  it("retains the fallback when all declared assets are malformed", async () => {
    const html = new TextEncoder().encode(
      `<html><img alt="Useful Tool logo" src="/useful-tool.png"></html>`,
    );
    const result = await acquireProductLogo(product, {
      fetch: async (url) =>
        url.endsWith(".png")
          ? response(url, "image/png", new Uint8Array([1, 2, 3]))
          : response(url, "text/html", html),
    });

    expect(result).toMatchObject({
      status: "fallback",
      reason: "invalid_assets",
      invalidCandidates: 1,
    });
  });

  it("acquires a validated product-specific asset with provenance", async () => {
    const html = new TextEncoder().encode(
      `<html><img alt="Useful Tool logo" src="/useful-tool.png"></html>`,
    );
    const result = await acquireProductLogo(product, {
      fetch: async (url) =>
        url.endsWith(".png") ? response(url, "image/png", png()) : response(url, "text/html", html),
    });

    expect(result).toMatchObject({
      status: "success",
      sourceKind: "product",
      sourceUrl: "https://useful.example/useful-tool.png",
      image: { width: 128, height: 128, extension: "png" },
    });
  });

  it("keeps bounded concurrent output in deterministic input order", async () => {
    const values = await mapWithConcurrency([3, 1, 2], 2, async (value) => {
      await Promise.resolve();
      return value * 2;
    });

    expect(values).toEqual([6, 2, 4]);
  });

  it("rejects a byte-identical asset selected for distinct canonical products", () => {
    const sharedImage = validateImage(png(), "image/png");
    expect(sharedImage).not.toBeNull();
    const acquisitions = rejectSharedAssetCollisions([
      {
        status: "success",
        product,
        sourceKind: "favicon",
        sourceUrl: "https://useful.example/favicon.png",
        pageUrl: product.websiteUrl,
        image: sharedImage!,
        bytes: png(),
      },
      {
        status: "success",
        product: { ...product, id: "software-2", slug: "useful-analytics" },
        sourceKind: "favicon",
        sourceUrl: "https://useful.example/favicon.png",
        pageUrl: product.websiteUrl,
        image: sharedImage!,
        bytes: png(),
      },
    ]);

    expect(acquisitions).toEqual([
      expect.objectContaining({ status: "fallback", reason: "ambiguous_identity" }),
      expect.objectContaining({ status: "fallback", reason: "ambiguous_identity" }),
    ]);
  });
});
