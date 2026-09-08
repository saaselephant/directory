import { execFileSync, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import capture from "./fixtures/partnerstack-marketplace.json";
import inventoryFixture from "./fixtures/software-inventory.json";
import {
  createPartnerStackAdapter,
  parsePartnerStackMarketplace,
  parsePartnerStackMarketplaceMarkdown,
} from "../partnerstack";
import { createBusinessReviewReport, parseSoftwareInventory } from "../report";

const inventory = parseSoftwareInventory(inventoryFixture);
const normalize = createPartnerStackAdapter().normalize;

describe("PartnerStack capture adapter", () => {
  it("preserves supplied commercial evidence and provenance without enabling production", () => {
    const candidates = parsePartnerStackMarketplace(capture);
    expect(candidates[0]).toMatchObject({
      network: "partnerstack",
      externalProgramId: "fixture-monday",
      externalAdvertiserId: "fixture-company-monday",
      programName: "monday.com",
      productName: "monday.com",
      vendorName: null,
      description: "Synthetic work-management program example.",
      domains: ["monday.com"],
      programUrl: "https://marketplace.example.com/monday",
      commission: { value: "20%", recurring: "Terms-dependent", terms: { fixtureOnly: true } },
      commercial: {
        commissionModel: "revenue_share",
        partnerTypes: ["Affiliate", "Publisher"],
        supportsSubIds: true,
      },
      providerRelationship: "available",
      match: null,
      reviewStatus: "unreviewed",
      issues: [],
      source: capture.source,
    });
    expect(candidates[1].commercial?.supportsSubIds).toBe(false);
    expect(candidates[2]).toMatchObject({
      providerRelationship: "approved",
      match: null,
      reviewStatus: "unreviewed",
    });
    expect(candidates[4].commercial?.supportsSubIds).toBeNull();
    expect(candidates[14].source).toEqual(capture.source);
    expect(candidates[6]).toMatchObject({
      providerRelationship: "unknown",
      commercial: { relationshipText: "Waitlisted" },
    });
  });

  it.each([
    ["monday.com", "monday.com", null, []],
    ["ActiveCampaign", "ActiveCampaign", null, []],
    ["1Password", "1Password", null, []],
    ["Freshdesk by Freshworks", "Freshdesk", "Freshworks", []],
    ["Freshservice by Freshworks", "Freshservice", "Freshworks", []],
    ["Kit (formerly ConvertKit)", "Kit", null, ["ConvertKit"]],
    ["Quo (formerly OpenPhone)", "Quo", null, ["OpenPhone"]],
  ])("preserves the distinct identity of %s", (name, productName, vendorName, formerNames) => {
    expect(normalize({ name })).toMatchObject({
      programName: name,
      productName,
      vendorName,
      commercial: { formerNames },
    });
  });

  it.each([
    ["Revenue Share", "revenue_share"],
    ["CPL", "cpl"],
    ["CPA", "cpa"],
    ["CPC", "cpc"],
    ["Cost per lead", "cpl"],
    ["20% recurring", "unknown"],
    ["CPL / CPA", "unknown"],
    ["constructor", "unknown"],
  ])("parses only an explicit single commission model: %s", (model, expected) => {
    const result = normalize({ name: "Example", commission: { model, text: "Unparsed offer" } });
    expect(result.commercial?.commissionModel).toBe(expected);
    expect(result.commission.value).toBeNull();
    expect(result.commercial?.commissionText).toBe("Unparsed offer");
  });

  it("does not derive a rate/model from prose or invent missing fields", () => {
    const result = normalize({
      name: "Example",
      companyId: 42,
      commission: { text: "Earn up to 30%" },
    });
    expect(result).toMatchObject({
      externalProgramId: null,
      externalAdvertiserId: "42",
      programUrl: null,
      destinationUrl: null,
      domains: [],
      description: null,
      providerRelationship: "unknown",
      commission: { type: null, value: null, cookieDuration: null, recurring: null },
      commercial: { commissionModel: "unknown", partnerTypes: [], supportsSubIds: null },
      source: { kind: "export", reference: null, observedAt: null },
    });
  });

  it("uses the same normalization for later API-sourced records", () => {
    const source = {
      kind: "api" as const,
      reference: "local-api-response-fixture",
      observedAt: "2026-09-08T10:00:00+05:30",
    };
    expect(createPartnerStackAdapter(source).normalize({ name: "Example" }).source).toMatchObject(
      source,
    );
    expect(
      parsePartnerStackMarketplace({
        schemaVersion: 1,
        source,
        programs: [{ name: "Example", source: { reference: "row-1" } }],
      })[0].source,
    ).toMatchObject({ ...source, reference: "row-1" });
  });

  it.each(
    [
      null,
      [],
      "bad",
      {},
      { name: 12 },
      { name: " " },
      { name: "Example", domains: 42 },
      { name: "Example", domains: [null] },
      { name: "Example", supportsSubIds: "false" },
      { name: "Example", programId: 9007199254740992 },
      { name: "Example", destinationUrl: "https://user@example.com" },
      { name: "Example", source: { observedAt: "yesterday" } },
      { name: "Example", source: { kind: "live" } },
      { name: "Example", commission: [] },
    ].map((input) => [input]),
  )("holds malformed records for review: %j", (record) => {
    const candidate = normalize(record);
    expect(candidate.issues.some((issue) => issue.severity === "error")).toBe(true);
    expect(createBusinessReviewReport([candidate], inventory).summary.DUPLICATE_OR_INVALID).toBe(1);
  });

  it.each(
    [
      [],
      {},
      { schemaVersion: 2, programs: [] },
      { schemaVersion: 1, programs: {} },
      { schemaVersion: 1, programs: [], source: "bad" },
    ].map((input) => [input]),
  )("rejects unsupported export envelopes: %j", (input) =>
    expect(() => parsePartnerStackMarketplace(input)).toThrow(),
  );

  it("parses a complete All Programs Markdown capture without inventing unavailable fields", () => {
    const markdown = `**Your programs**

Programs not applied to yet

1

**All programs**3 programs

[image](https://company-images.partnerstack.com/one.png)

**Available Tool**

An available marketplace program.

**Earn 20% recurring commission**

[image](https://company-images.partnerstack.com/two.png)

**Pending Tool**

An application awaiting review.

**$10 per signup**

svgApplication pending

[image](https://company-images.partnerstack.com/three.png)

**Joined Tool**

**Rev Share | 20% of Revenue**

svgJoined`;
    const candidates = parsePartnerStackMarketplaceMarkdown(markdown);

    expect(candidates).toHaveLength(3);
    expect(candidates.map((item) => item.providerRelationship)).toEqual([
      "available",
      "applied",
      "approved",
    ]);
    expect(candidates[0]).toMatchObject({
      programName: "Available Tool",
      description: "An available marketplace program.",
      externalProgramId: null,
      commercial: {
        commissionText: "Earn 20% recurring commission",
        commissionModel: "unknown",
        supportsSubIds: null,
      },
    });
    expect(candidates[2].commercial?.commissionModel).toBe("revenue_share");
  });

  it("does not assign one commission model when Markdown states multiple models", () => {
    const markdown = `**All programs**1 programs

[image](https://company-images.partnerstack.com/one.png)

**Mixed Model Tool**

**$5 CPL / $100 CPA**`;

    expect(
      parsePartnerStackMarketplaceMarkdown(markdown)[0].commercial?.commissionModel,
    ).toBe("unknown");
  });

  it("preserves a Markdown description when commission terms are absent", () => {
    const markdown = `**All programs**1 programs

[image](https://company-images.partnerstack.com/one.png)

**No Terms Tool**

The marketplace card has a description but no commission proposition.`;

    expect(parsePartnerStackMarketplaceMarkdown(markdown)[0]).toMatchObject({
      programName: "No Terms Tool",
      description: "The marketplace card has a description but no commission proposition.",
      commercial: { commissionText: null },
    });
  });

  it("rejects a partial Markdown capture instead of reporting incomplete business totals", () => {
    expect(() =>
      parsePartnerStackMarketplaceMarkdown(`**All programs**2 programs

[image](https://company-images.partnerstack.com/one.png)

**Only Tool**

**Unknown**`),
    ).toThrow("declared 2 programs but contained 1");
  });
});

describe("offline commercial review", () => {
  it("partitions every fixture row and leaves source candidates untouched", () => {
    const candidates = parsePartnerStackMarketplace(capture);
    const before = structuredClone(candidates);
    const report = createBusinessReviewReport(candidates, inventory);
    expect(report.summary).toEqual({
      EXISTING_CATALOG_MATCH: 6,
      UNMATCHED_COMMERCIAL_OPPORTUNITY: 1,
      AMBIGUOUS_REVIEW_REQUIRED: 3,
      DUPLICATE_OR_INVALID: 5,
    });
    expect(
      report.groups.EXISTING_CATALOG_MATCH.map((entry) => entry.candidate.match?.slug),
    ).toEqual(["monday", "activecampaign", "1password", "freshdesk", "freshservice", "kit"]);
    expect(
      report.groups.UNMATCHED_COMMERCIAL_OPPORTUNITY.map((entry) => entry.candidate.programName),
    ).toEqual(["Example Future Analytics"]);
    expect(report.groups.DUPLICATE_OR_INVALID.map((entry) => entry.inputIndex)).toEqual([
      10, 11, 12, 13, 14,
    ]);
    expect(candidates).toEqual(before);
    expect(createBusinessReviewReport(candidates, inventory)).toEqual(report);
    expect(
      report.groups.EXISTING_CATALOG_MATCH.every(
        (entry) => entry.candidate.match?.decision === "suggested",
      ),
    ).toBe(true);
  });

  it("holds shared product-family domains and contradictory exact evidence", () => {
    const report = createBusinessReviewReport(parsePartnerStackMarketplace(capture), inventory);
    const entries = report.groups.AMBIGUOUS_REVIEW_REQUIRED;
    expect(entries.map((entry) => entry.inputIndex)).toEqual([6, 8, 9]);
    expect(entries[1].evidence.join(" ")).toContain("freshdesk, freshservice");
    expect(entries[2].evidence.join(" ")).toContain("Conflicting exact identity evidence");
    expect(entries.every((entry) => entry.candidate.match?.softwareId === null)).toBe(true);
  });

  it("does not fuzzy-match a misspelled product name", () => {
    for (const name of ["Active Campain"]) {
      expect(
        createBusinessReviewReport([normalize({ name })], inventory).summary
          .UNMATCHED_COMMERCIAL_OPPORTUNITY,
      ).toBe(1);
    }
  });

  it("routes a former-name catalog hit to review instead of proposing a duplicate listing", () => {
    const report = createBusinessReviewReport(
      [normalize({ name: "Quo (formerly OpenPhone)" })],
      inventory,
    );
    expect(report.summary.AMBIGUOUS_REVIEW_REQUIRED).toBe(1);
    expect(report.groups.AMBIGUOUS_REVIEW_REQUIRED[0].evidence.join(" ")).toContain("openphone");
    expect(report.groups.AMBIGUOUS_REVIEW_REQUIRED[0].candidate.match?.softwareId).toBeNull();
  });

  it("holds explicit name-field conflicts and conflicting reviewed bindings", () => {
    const candidate = normalize({ name: "monday.com", productName: "ActiveCampaign" });
    expect(
      createBusinessReviewReport([candidate], inventory).summary.AMBIGUOUS_REVIEW_REQUIRED,
    ).toBe(1);
    expect(
      createBusinessReviewReport([normalize({ name: "monday.com", programId: "42" })], inventory, [
        { network: "partnerstack", externalProgramId: "42", softwareId: inventory[0].id },
        { network: "partnerstack", externalProgramId: "42", softwareId: inventory[1].id },
      ]).summary.AMBIGUOUS_REVIEW_REQUIRED,
    ).toBe(1);
  });

  it("keeps report logic network neutral", () => {
    const candidate = { ...normalize({ name: "monday.com" }), network: "awin" };
    expect(createBusinessReviewReport([candidate], inventory).summary.EXISTING_CATALOG_MATCH).toBe(
      1,
    );
  });

  it.each(
    [
      null,
      [{}],
      [{ id: "a", slug: "a", name: "a", websiteUrl: "javascript:bad" }],
      [inventory[0], inventory[0]],
    ].map((input) => [input]),
  )("rejects invalid catalog inputs: %j", (input) =>
    expect(() => parseSoftwareInventory(input)).toThrow(),
  );

  it("prints the fixture report from the local CLI", () => {
    const output = execFileSync(
      process.execPath,
      [
        "scripts/partnerstack-review.mjs",
        "src/lib/affiliate-discovery/__tests__/fixtures/partnerstack-marketplace.json",
        "src/lib/affiliate-discovery/__tests__/fixtures/software-inventory.json",
      ],
      { encoding: "utf8" },
    );
    expect(JSON.parse(output).summary).toEqual(
      createBusinessReviewReport(parsePartnerStackMarketplace(capture), inventory).summary,
    );
    const invalid = spawnSync(process.execPath, ["scripts/partnerstack-review.mjs"], {
      encoding: "utf8",
    });
    expect(invalid.status).toBe(1);
    expect(invalid.stdout).toBe("");
    expect(invalid.stderr).toContain("Usage:");
  }, 30000);
});
