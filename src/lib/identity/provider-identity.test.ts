import { describe, expect, it } from "vitest";

import {
  createProviderObjectKey,
  matchProviderIdentity,
  normalizeIdentityDomain,
  normalizeIdentityName,
  type CanonicalIdentityClaim,
  type CanonicalIdentityEntity,
  type ProviderIdentityRecord,
} from "./provider-identity";

const entities: CanonicalIdentityEntity[] = [
  { kind: "vendor", id: "vendor-hubspot" },
  { kind: "vendor", id: "vendor-freshbooks" },
  { kind: "vendor", id: "vendor-monday" },
  { kind: "software", id: "software-hubspot", vendorId: "vendor-hubspot" },
  { kind: "software", id: "software-hubspot-crm", vendorId: "vendor-hubspot" },
  { kind: "software", id: "software-freshbooks", vendorId: "vendor-freshbooks" },
  {
    kind: "software",
    id: "software-freshbooks-accounting",
    vendorId: "vendor-freshbooks",
  },
  { kind: "software", id: "software-monday", vendorId: "vendor-monday" },
  { kind: "software", id: "software-monday-work-os", vendorId: "vendor-monday" },
  { kind: "category", id: "category-crm" },
];

function claim(
  target: CanonicalIdentityClaim["target"],
  claimType: CanonicalIdentityClaim["claimType"],
  value: string,
  claimScope: CanonicalIdentityClaim["claimScope"] = "canonical",
): CanonicalIdentityClaim {
  return {
    target,
    claimType,
    claimScope,
    normalizedValue:
      claimType === "domain"
        ? normalizeIdentityDomain(value)!
        : claimType === "slug"
          ? value.toLocaleLowerCase("en")
          : normalizeIdentityName(value),
    status: "active",
    verifiedAt: "2026-09-08T00:00:00Z",
  };
}

const claims: CanonicalIdentityClaim[] = [
  claim({ kind: "vendor", id: "vendor-hubspot" }, "name", "HubSpot"),
  claim({ kind: "vendor", id: "vendor-hubspot" }, "domain", "hubspot.com", "official_vendor"),
  claim({ kind: "software", id: "software-hubspot" }, "name", "HubSpot"),
  claim({ kind: "software", id: "software-hubspot" }, "slug", "hubspot"),
  claim({ kind: "software", id: "software-hubspot-crm" }, "name", "HubSpot CRM"),
  claim({ kind: "software", id: "software-hubspot-crm" }, "slug", "hubspot-crm"),
  claim(
    { kind: "software", id: "software-hubspot-crm" },
    "domain",
    "crm.hubspot.com",
    "product_specific",
  ),
  claim({ kind: "vendor", id: "vendor-freshbooks" }, "name", "FreshBooks"),
  claim({ kind: "vendor", id: "vendor-freshbooks" }, "domain", "freshbooks.com", "official_vendor"),
  claim({ kind: "software", id: "software-freshbooks" }, "name", "FreshBooks"),
  claim({ kind: "software", id: "software-freshbooks" }, "slug", "freshbooks"),
  claim(
    { kind: "software", id: "software-freshbooks-accounting" },
    "name",
    "FreshBooks Accounting",
  ),
  claim(
    { kind: "software", id: "software-freshbooks-accounting" },
    "slug",
    "freshbooks-accounting",
  ),
  claim({ kind: "vendor", id: "vendor-monday" }, "name", "monday.com"),
  claim({ kind: "vendor", id: "vendor-monday" }, "domain", "monday.com", "official_vendor"),
  claim({ kind: "software", id: "software-monday" }, "name", "monday.com"),
  claim({ kind: "software", id: "software-monday" }, "slug", "monday"),
  claim({ kind: "software", id: "software-monday-work-os" }, "name", "monday Work OS"),
  claim({ kind: "software", id: "software-monday-work-os" }, "slug", "monday-work-os"),
  claim(
    { kind: "software", id: "software-monday-work-os" },
    "domain",
    "workos.monday.com",
    "product_specific",
  ),
  claim({ kind: "category", id: "category-crm" }, "slug", "crm"),
];

function record(overrides: Partial<ProviderIdentityRecord> = {}): ProviderIdentityRecord {
  return {
    providerKey: "g2",
    externalObjectType: "product",
    externalId: "product-1",
    targetKind: "software",
    displayName: null,
    externalSlug: null,
    domain: null,
    confirmedVendorId: null,
    ...overrides,
  };
}

describe("provider identity normalization and idempotency", () => {
  it("normalizes names and domains without changing provider IDs", () => {
    expect(normalizeIdentityName(" monday.com & CRM ")).toBe("monday com and crm");
    expect(normalizeIdentityDomain("https://WWW.HubSpot.com/products/crm")).toBe("hubspot.com");
    expect(normalizeIdentityDomain("https://user@hubspot.com")).toBeNull();
    expect(createProviderObjectKey("G2", "Product", "ABC-123")).not.toBe(
      createProviderObjectKey("g2", "product", "abc-123"),
    );
  });

  it("creates the same provider-object key for idempotent refreshes", () => {
    expect(createProviderObjectKey(" G2 ", " Product ", "ABC-123")).toBe(
      createProviderObjectKey("g2", "product", "ABC-123"),
    );
  });

  it("represents provider-neutral object types without changing canonical IDs", () => {
    expect([
      createProviderObjectKey("g2", "product", "g2-product-id"),
      createProviderObjectKey("g2", "vendor", "g2-vendor-id"),
      createProviderObjectKey("g2", "category", "g2-category-id"),
      createProviderObjectKey("saas_browser", "company", "company-id"),
      createProviderObjectKey("sovrn", "merchant", "merchant-id"),
      createProviderObjectKey("partnerstack", "program", "program-key"),
    ]).toHaveLength(6);
  });
});

describe("deterministic provider identity matching", () => {
  it("preserves a reviewed binding ahead of conflicting provider evidence", () => {
    const result = matchProviderIdentity({
      record: record({
        externalId: "reviewed-id",
        externalSlug: "monday-work-os",
        domain: "workos.monday.com",
      }),
      entities,
      claims,
      existingIdentities: [
        {
          externalIdentityId: "external-1",
          providerKey: "g2",
          externalObjectType: "product",
          externalId: "reviewed-id",
          matchState: "reviewed_matched",
          matchMethod: "reviewed_binding",
          confidence: 100,
          target: { kind: "software", id: "software-hubspot-crm" },
        },
      ],
    });

    expect(result).toMatchObject({
      decision: "refresh",
      matchState: "reviewed_matched",
      matchMethod: "reviewed_binding",
      target: { kind: "software", id: "software-hubspot-crm" },
    });
  });

  it("refreshes an existing provider object without rematching it", () => {
    const result = matchProviderIdentity({
      record: record({ externalId: "stable-provider-id", displayName: "Changed name" }),
      entities,
      claims,
      existingIdentities: [
        {
          externalIdentityId: "external-2",
          providerKey: "g2",
          externalObjectType: "product",
          externalId: "stable-provider-id",
          matchState: "auto_matched",
          matchMethod: "alias",
          confidence: 90,
          target: { kind: "software", id: "software-hubspot" },
        },
      ],
    });

    expect(result).toMatchObject({
      decision: "refresh",
      matchMethod: "alias",
      confidence: 90,
      target: { kind: "software", id: "software-hubspot" },
      externalIdentityId: "external-2",
    });
  });

  it("auto-matches unique reviewed product domains and aliases", () => {
    expect(
      matchProviderIdentity({
        record: record({ domain: "crm.hubspot.com" }),
        entities,
        claims,
      }),
    ).toMatchObject({
      decision: "auto_bind",
      matchMethod: "product_domain",
      target: { id: "software-hubspot-crm" },
    });

    expect(
      matchProviderIdentity({
        record: record({ externalSlug: "freshbooks-accounting" }),
        entities,
        claims,
      }),
    ).toMatchObject({
      decision: "auto_bind",
      matchMethod: "alias",
      target: { id: "software-freshbooks-accounting" },
    });
  });

  it("requires confirmed vendor evidence for exact software-name matching", () => {
    expect(
      matchProviderIdentity({
        record: record({
          displayName: "HubSpot CRM",
          confirmedVendorId: "vendor-hubspot",
        }),
        entities,
        claims,
      }),
    ).toMatchObject({
      decision: "auto_bind",
      matchMethod: "name_vendor",
      target: { id: "software-hubspot-crm" },
    });

    expect(
      matchProviderIdentity({
        record: record({ displayName: "HubSpot CRM" }),
        entities,
        claims,
      }),
    ).toMatchObject({ decision: "unmatched", target: null });
  });

  it("marks conflicting exact evidence ambiguous", () => {
    const result = matchProviderIdentity({
      record: record({
        externalSlug: "hubspot-crm",
        domain: "workos.monday.com",
      }),
      entities,
      claims,
    });

    expect(result).toMatchObject({ decision: "review", matchState: "ambiguous" });
    expect(result.candidateTargets.map(({ id }) => id)).toEqual([
      "software-hubspot-crm",
      "software-monday-work-os",
    ]);
  });

  it("treats a reviewed name that conflicts with a reviewed slug as ambiguous", () => {
    const result = matchProviderIdentity({
      record: record({
        displayName: "monday Work OS",
        externalSlug: "hubspot-crm",
      }),
      entities,
      claims,
    });

    expect(result).toMatchObject({
      decision: "review",
      matchState: "ambiguous",
      target: null,
    });
    expect(result.candidateTargets.map(({ id }) => id)).toEqual([
      "software-hubspot-crm",
      "software-monday-work-os",
    ]);
  });

  it("never converts fuzzy suggestions into canonical bindings", () => {
    const result = matchProviderIdentity({
      record: record({ displayName: "Hub Spot CRM" }),
      entities,
      claims,
      fuzzySuggestions: [{ kind: "software", id: "software-hubspot-crm" }],
    });

    expect(result).toMatchObject({
      decision: "review",
      matchState: "ambiguous",
      matchMethod: "fuzzy_suggestion",
      target: null,
    });
  });

  it.each([
    ["HubSpot", "vendor-hubspot", ["software-hubspot", "software-hubspot-crm"]],
    ["FreshBooks", "vendor-freshbooks", ["software-freshbooks", "software-freshbooks-accounting"]],
    ["monday.com", "vendor-monday", ["software-monday", "software-monday-work-os"]],
  ])("keeps the %s product family distinct", (_name, vendorId, expectedIds) => {
    const result = matchProviderIdentity({
      record: record({
        providerKey: "partnerstack",
        externalObjectType: "program",
        externalId: `${vendorId}-program`,
        confirmedVendorId: vendorId,
      }),
      entities,
      claims,
    });

    expect(result).toMatchObject({
      decision: "review",
      matchState: "ambiguous",
      target: null,
    });
    expect(result.candidateTargets.map(({ id }) => id)).toEqual(expectedIds);
  });

  it("does not use a shared vendor domain as product-specific evidence", () => {
    const result = matchProviderIdentity({
      record: record({ domain: "hubspot.com" }),
      entities,
      claims,
    });

    expect(result).toMatchObject({
      decision: "review",
      matchState: "ambiguous",
      target: null,
    });
    expect(result.candidateTargets.map(({ id }) => id)).toEqual([
      "software-hubspot",
      "software-hubspot-crm",
    ]);
  });

  it("requires review when a product-specific domain is shared by products", () => {
    const sharedClaims = [
      ...claims,
      claim(
        { kind: "software", id: "software-hubspot" },
        "domain",
        "crm.hubspot.com",
        "product_specific",
      ),
    ];
    const result = matchProviderIdentity({
      record: record({ domain: "crm.hubspot.com" }),
      entities,
      claims: sharedClaims,
    });

    expect(result).toMatchObject({
      decision: "review",
      matchState: "ambiguous",
      target: null,
    });
  });

  it("ignores unreviewed claims for automatic matching", () => {
    const result = matchProviderIdentity({
      record: record({ externalSlug: "hubspot-crm" }),
      entities,
      claims: claims.map((item) => ({ ...item, verifiedAt: null })),
    });

    expect(result).toMatchObject({ decision: "unmatched", target: null });
  });

  it("keeps historical aliases and fuzzy evidence in human review", () => {
    const historicalSlug = {
      ...claim({ kind: "software", id: "software-hubspot-crm" }, "slug", "old-crm"),
      claimScope: "historical" as const,
    };
    const result = matchProviderIdentity({
      record: record({ externalSlug: "old-crm" }),
      entities,
      claims: [historicalSlug],
      fuzzySuggestions: [{ kind: "software", id: "software-hubspot-crm" }],
    });

    expect(result).toMatchObject({
      decision: "review",
      matchMethod: "fuzzy_suggestion",
      target: null,
    });
  });

  it.each(["ignored", "retired"] as const)(
    "preserves a provider object marked %s without rematching",
    (matchState) => {
      const result = matchProviderIdentity({
        record: record({ externalId: "inactive-object", externalSlug: "hubspot-crm" }),
        entities,
        claims,
        existingIdentities: [
          {
            externalIdentityId: "external-inactive",
            providerKey: "g2",
            externalObjectType: "product",
            externalId: "inactive-object",
            matchState,
            matchMethod: null,
            confidence: 0,
            target: null,
          },
        ],
      });

      expect(result).toMatchObject({
        decision: "refresh",
        matchState,
        target: null,
      });
    },
  );

  it("matches vendor and category provider objects only through reviewed evidence", () => {
    expect(
      matchProviderIdentity({
        record: record({
          externalObjectType: "vendor",
          targetKind: "vendor",
          displayName: "HubSpot",
          domain: "hubspot.com",
        }),
        entities,
        claims,
      }),
    ).toMatchObject({
      decision: "auto_bind",
      matchMethod: "vendor_identity",
      target: { kind: "vendor", id: "vendor-hubspot" },
    });

    expect(
      matchProviderIdentity({
        record: record({
          externalObjectType: "category",
          targetKind: "category",
          externalSlug: "crm",
        }),
        entities,
        claims,
      }),
    ).toMatchObject({
      decision: "auto_bind",
      target: { kind: "category", id: "category-crm" },
    });
  });
});
