import { describe, expect, it } from "vitest";

import { prepareCatalogPublicationBatch, renderCatalogPublicationSql } from "./catalog-publication";
import type { ProductFactoryBatchResult, ProductFactoryReadyPayload } from "./product-factory";

function readyPayload(): ProductFactoryReadyPayload {
  return {
    idempotencyKey: '["official_web","product","example.com/product"]',
    vendor: {
      resolution: "create",
      vendorId: null,
      vendor_name: "Example Inc.",
      slug: "example-inc",
      website_url: "https://example.com",
    },
    software: {
      software_id: null,
      software_name: "Example Product",
      vendor: "Example Inc.",
      vendor_id: null,
      slug: "example-product",
      website_url: "https://example.com/product",
      short_description: "A supported example product description for controlled publication.",
      full_description: null,
      best_for: null,
      key_features: "Shared boards; Workflow automation",
      pricing: null,
      free_plan: null,
      free_trial: null,
      status: "Candidate",
      publication_status: "in_review",
      verification_status: "needs_verification",
      verified_at: null,
    },
    categories: [
      {
        category_id: "CAT103",
        slug: "manage-projects-teams",
        primary_category: true,
      },
      {
        category_id: "CAT103",
        slug: "manage-projects-teams",
        primary_category: false,
      },
    ],
    officialOutboundDestination: "https://example.com/product",
    provenance: [
      {
        url: "https://example.com/product",
        retrievedAt: "2026-09-08T12:00:00Z",
        sourceType: "official_product",
      },
    ],
  };
}

function readyResult(payload = readyPayload()): ProductFactoryBatchResult {
  return {
    processed: 1,
    ready: 1,
    exceptions: 0,
    duplicatesDetected: 0,
    manualProductEntryActionsRequired: 0,
    results: [
      {
        candidate: payload.software.software_name,
        decision: "READY",
        reasons: [],
        payload,
      },
    ],
  };
}

describe("controlled catalog publication", () => {
  it("adapts READY payloads deterministically and deduplicates category links", () => {
    const first = prepareCatalogPublicationBatch(readyResult());
    const second = prepareCatalogPublicationBatch(readyResult());

    expect(second).toEqual(first);
    expect(first.records).toHaveLength(1);
    expect(first.records[0]).toMatchObject({
      providerKey: "official_web",
      externalObjectType: "product",
      externalId: "example.com/product",
      softwareName: "Example Product",
      vendorResolution: "create",
      vendorId: null,
      vendorCanonicalName: "example inc.",
      categories: [
        {
          categoryId: "CAT103",
          slug: "manage-projects-teams",
          primaryCategory: true,
        },
      ],
    });
    expect(first.records[0].softwareId).toMatch(/^PF-[a-f0-9]{24}$/);
  });

  it("rejects a batch containing any exception", () => {
    const result = readyResult();
    result.ready = 0;
    result.exceptions = 1;
    result.results[0] = {
      candidate: "Example Product",
      decision: "EXCEPTION",
      reasons: [{ code: "AMBIGUOUS_IDENTITY", message: "Conflict." }],
      payload: null,
    };

    expect(() => prepareCatalogPublicationBatch(result)).toThrow(
      "Only an all-READY Product Factory result can become a publication batch.",
    );
  });

  it("rejects payloads that bypass the review-state contract", () => {
    const payload = readyPayload();
    payload.software.publication_status = "published" as "in_review";

    expect(() => prepareCatalogPublicationBatch(readyResult(payload))).toThrow(
      "controlled publication contract",
    );
  });

  it("renders one transactional, idempotent SQL batch without affiliate writes", () => {
    const batch = prepareCatalogPublicationBatch(readyResult());
    const sql = renderCatalogPublicationSql(batch);

    expect(sql).toContain("begin;");
    expect(sql).toContain("lock table public.external_identities");
    expect(sql).toContain("on commit drop");
    expect(sql).toContain("decision.\"vendorResolution\" = 'existing'");
    expect(sql).toContain("EXCLUDED_IDENTITY_CONFLICT");
    expect(sql).toContain("EXCLUDED_AMBIGUOUS_IDENTITY");
    expect(sql).toContain("'in_review'::public.saaselephant_publication_status");
    expect(sql).toContain("set publication_status = 'published'");
    expect(sql).toContain("insert into public.external_identities");
    expect(sql).toContain("'auto_matched'");
    expect(sql).toContain("'provider_id'");
    expect(sql).toContain("commit;");
    expect(sql).not.toMatch(/insert\s+into\s+public\.affiliate_/i);
    expect(sql).not.toMatch(/update\s+public\.affiliate_/i);
    expect(renderCatalogPublicationSql(batch)).toBe(sql);
  });

  it("rejects data that could terminate the SQL JSON literal", () => {
    const batch = prepareCatalogPublicationBatch(readyResult());
    batch.records[0].shortDescription = "$product_factory_batch$";

    expect(() => renderCatalogPublicationSql(batch)).toThrow("SQL JSON delimiter");
  });
});
