import { describe, expect, it } from "vitest";

import {
  createCandidateFingerprint,
  findCandidateDuplicates,
  normalizeDomain,
  normalizeHttpUrl,
  normalizeName,
} from "../normalize";
import {
  matchAffiliateCandidate,
  type AffiliateSoftwareInventoryItem,
} from "../match";
import type { AffiliateProgramCandidate } from "../types";

function candidate(
  overrides: Partial<AffiliateProgramCandidate> = {},
): AffiliateProgramCandidate {
  return {
    network: "partnerstack",
    externalProgramId: null,
    externalAdvertiserId: null,
    programName: "Example Partner Program",
    vendorName: "Example",
    productName: "Example",
    softwareSlugHint: null,
    programUrl: null,
    applicationUrl: null,
    destinationUrl: null,
    domains: [],
    commission: {
      type: null,
      value: null,
      recurring: null,
      cookieDuration: null,
      terms: {},
    },
    providerRelationship: "available",
    source: { kind: "export", reference: null, observedAt: null },
    match: null,
    reviewStatus: "unreviewed",
    issues: [],
    ...overrides,
  };
}

const inventory: AffiliateSoftwareInventoryItem[] = [
  {
    id: "software-example",
    slug: "example",
    name: "Example",
    vendorName: "Example Inc.",
    websiteUrl: "https://www.example.com/product",
  },
  {
    id: "software-freshbooks",
    slug: "freshbooks",
    name: "FreshBooks",
    vendorName: "FreshBooks",
    websiteUrl: "https://freshbooks.com",
  },
  {
    id: "software-freshbooks-accounting",
    slug: "freshbooks-accounting",
    name: "FreshBooks Accounting",
    vendorName: "FreshBooks",
    websiteUrl: "https://accounting.freshbooks.com",
  },
  {
    id: "software-hubspot",
    slug: "hubspot",
    name: "HubSpot",
    vendorName: "HubSpot",
    websiteUrl: "https://hubspot.com",
  },
  {
    id: "software-hubspot-crm",
    slug: "hubspot-crm",
    name: "HubSpot CRM",
    vendorName: "HubSpot",
    websiteUrl: "https://crm.hubspot.com",
  },
  {
    id: "software-monday",
    slug: "monday",
    name: "monday.com",
    vendorName: "monday.com",
    websiteUrl: "https://monday.com",
  },
  {
    id: "software-monday-work-os",
    slug: "monday-work-os",
    name: "monday Work OS",
    vendorName: "monday.com",
    websiteUrl: "https://workos.monday.com",
  },
];

describe("affiliate candidate normalization", () => {
  it("normalizes names, domains and canonical HTTPS URLs", () => {
    expect(normalizeName("  Example & Co.—Cloud  ")).toBe("example and co cloud");
    expect(normalizeDomain("HTTPS://WWW.Example.COM/path")).toBe("example.com");
    expect(normalizeHttpUrl("https://Example.com/offers/?b=2&a=1#terms")).toBe(
      "https://example.com/offers?a=1&b=2",
    );
  });

  it.each(["http://example.com", "javascript:alert(1)", "https://user@example.com"])(
    "rejects an unsafe destination: %s",
    (url) => expect(normalizeHttpUrl(url)).toBeNull(),
  );

  it("creates deterministic fingerprints independent of timestamps and term key order", () => {
    const first = candidate({
      network: "awin",
      externalProgramId: " Program-42 ",
      source: { kind: "export", reference: "one", observedAt: "2026-01-01T00:00:00Z" },
      commission: {
        type: null,
        value: null,
        recurring: null,
        cookieDuration: null,
        terms: { b: 2, a: 1 },
      },
    });
    const second = candidate({
      ...first,
      source: { kind: "api", reference: "two", observedAt: "2027-01-01T00:00:00Z" },
      commission: { ...first.commission, terms: { a: 1, b: 2 } },
    });

    expect(createCandidateFingerprint(first)).toEqual(createCandidateFingerprint(second));
  });

  it("preserves name field identity while remaining deterministic", () => {
    const first = candidate({
      programName: "Acme Partner Program",
      vendorName: "Acme",
      productName: "Acme Cloud",
      source: { kind: "export", reference: "first", observedAt: "2026-01-01T00:00:00Z" },
    });
    const equivalent = candidate({
      productName: "  ACME CLOUD ",
      vendorName: "ACME",
      programName: "Acme Partner Program",
      source: { kind: "api", reference: "second", observedAt: "2027-01-01T00:00:00Z" },
    });
    const swapped = candidate({
      programName: "Acme",
      vendorName: "Acme Partner Program",
      productName: "Acme Cloud",
    });

    expect(createCandidateFingerprint(first)).toEqual(createCandidateFingerprint(equivalent));
    expect(createCandidateFingerprint(first)).not.toEqual(createCandidateFingerprint(swapped));
  });

  it("reports duplicates without merging candidate records", () => {
    const candidates = [
      candidate({ network: "cj", externalProgramId: "123" }),
      candidate({ network: "cj", externalProgramId: "123", programName: "Updated name" }),
      candidate({ network: "impact", externalProgramId: "123" }),
    ];

    expect(findCandidateDuplicates(candidates)).toEqual([
      expect.objectContaining({
        basis: "external-program-id",
        candidateIndexes: [0, 1],
      }),
    ]);
    expect(candidates[0].programName).toBe("Example Partner Program");
    expect(candidates[1].programName).toBe("Updated name");
  });
});

describe("affiliate candidate matching", () => {
  it("confirms only an explicit reviewed network binding", () => {
    const result = matchAffiliateCandidate(
      candidate({ network: "impact", externalProgramId: "advertiser-7" }),
      inventory,
      [{ network: "impact", externalProgramId: "advertiser-7", softwareId: "software-example" }],
    );

    expect(result).toMatchObject({
      softwareId: "software-example",
      decision: "confirmed",
      confidence: 100,
    });
  });

  it("preserves conflicting reviewed bindings instead of auto-confirming", () => {
    const result = matchAffiliateCandidate(
      candidate({
        network: "impact",
        externalProgramId: "advertiser-7",
        domains: ["example.com"],
      }),
      inventory,
      [
        {
          network: "impact",
          externalProgramId: "advertiser-7",
          softwareId: "software-example",
        },
        {
          network: "impact",
          externalProgramId: "advertiser-7",
          softwareId: "software-hubspot",
        },
      ],
    );

    expect(result).toMatchObject({
      softwareId: null,
      slug: null,
      decision: "ambiguous",
      confidence: 0,
    });
    expect(result?.reasons.join(" ")).toContain(
      "Reviewed bindings point to multiple software records: example, hubspot.",
    );
  });

  it("preserves a conflict between reviewed software ID and reviewed slug", () => {
    const result = matchAffiliateCandidate(
      candidate({ network: "awin", externalProgramId: "program-42" }),
      inventory,
      [
        {
          network: "awin",
          externalProgramId: "program-42",
          softwareId: "software-example",
          softwareSlug: "hubspot",
        },
      ],
    );

    expect(result).toMatchObject({
      softwareId: null,
      slug: null,
      decision: "ambiguous",
    });
    expect(result?.reasons.join(" ")).toContain(
      'Reviewed software ID "software-example" conflicts with reviewed slug "hubspot".',
    );
  });

  it("suggests exact domain, slug and product-name matches in precedence order", () => {
    expect(
      matchAffiliateCandidate(
        candidate({
          network: "awin",
          domains: ["www.example.com"],
          softwareSlugHint: "wrong-slug",
          productName: "Wrong name",
        }),
        inventory,
      ),
    ).toMatchObject({ softwareId: "software-example", confidence: 95, decision: "suggested" });

    expect(
      matchAffiliateCandidate(
        candidate({ network: "cj", softwareSlugHint: "example", productName: "Wrong name" }),
        inventory,
      ),
    ).toMatchObject({ softwareId: "software-example", confidence: 90, decision: "suggested" });

    expect(
      matchAffiliateCandidate(candidate({ network: "impact", productName: "EXAMPLE" }), inventory),
    ).toMatchObject({ softwareId: "software-example", confidence: 85, decision: "suggested" });
  });

  it.each([
    ["FreshBooks", "FreshBooks Partner Program", ["freshbooks", "freshbooks-accounting"]],
    ["HubSpot", "HubSpot Affiliate Program", ["hubspot", "hubspot-crm"]],
    ["monday.com", "monday.com Partner Program", ["monday", "monday-work-os"]],
  ])("keeps the %s product family ambiguous", (vendorName, programName, slugs) => {
    const result = matchAffiliateCandidate(
      candidate({
        vendorName,
        productName: null,
        programName,
      }),
      inventory,
    );

    expect(result).toMatchObject({ decision: "ambiguous", softwareId: null, slug: null });
    expect(result?.reasons.join(" ")).toContain(slugs.join(", "));
  });

  it("does not turn provider approval into production confirmation", () => {
    const result = matchAffiliateCandidate(
      candidate({
        providerRelationship: "approved",
        productName: "Example",
        reviewStatus: "unreviewed",
      }),
      inventory,
    );

    expect(result?.decision).toBe("suggested");
    expect(result?.decision).not.toBe("confirmed");
  });
});
