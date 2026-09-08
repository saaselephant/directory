import { describe, expect, it } from "vitest";

import {
  acquireAndRunProductFactoryBatch,
  processProductCandidate,
  runProductFactoryBatch,
  type ProductFactoryCandidate,
  type ProductFactoryContext,
} from "./product-factory";

const retrievedAt = "2026-09-09T12:00:00Z";
const sourceUrl = "https://example.com/product";
const sourceContent =
  "Example Product is made by Example Inc. Plan projects with shared boards and automate team workflows. Project management helps teams coordinate work. Pricing starts at $10 per user.";

const context: ProductFactoryContext = {
  software: [],
  vendors: [],
  categories: [
    {
      id: "category-projects",
      slug: "manage-projects-teams",
      name: "Manage Projects & Teams",
    },
    {
      id: "category-workflows",
      slug: "workflow-automation",
      name: "Workflow Automation",
    },
  ],
};

function citation(quote: string) {
  return [{ sourceUrl, quote }];
}

function candidate(overrides: Partial<ProductFactoryCandidate> = {}): ProductFactoryCandidate {
  return {
    source: {
      providerKey: "official_web",
      externalObjectType: "product",
      externalId: "example.com/product",
    },
    productName: {
      value: "Example Product",
      citations: citation("Example Product"),
    },
    vendorName: {
      value: "Example Inc.",
      citations: citation("Example Inc."),
    },
    officialUrl: sourceUrl,
    description: {
      value: "Plan projects with shared boards and automate team workflows.",
      citations: citation("Plan projects with shared boards and automate team workflows."),
    },
    primaryCategory: {
      slug: "manage-projects-teams",
      confidence: 0.98,
      citations: citation("Project management helps teams coordinate work."),
    },
    capabilities: [
      {
        value: "Shared project boards",
        citations: citation("shared boards"),
      },
      {
        value: "Workflow automation",
        citations: citation("automate team workflows"),
      },
    ],
    pricing: null,
    evidence: [
      {
        url: sourceUrl,
        retrievedAt,
        sourceType: "official_product",
        httpStatus: 200,
        content: sourceContent,
      },
    ],
    ...overrides,
  };
}

describe("Product Factory", () => {
  it("creates a conservative in-review payload from supported official evidence", () => {
    const result = processProductCandidate(candidate(), context);

    expect(result.decision).toBe("READY");
    expect(result.payload).toMatchObject({
      idempotencyKey: '["official_web","product","example.com/product"]',
      vendor: {
        resolution: "create",
        vendorId: null,
        vendor_name: "Example Inc.",
      },
      software: {
        software_id: null,
        slug: "example-product",
        publication_status: "in_review",
        verification_status: "needs_verification",
        pricing: null,
      },
      officialOutboundDestination: sourceUrl,
    });
    expect(result.review).toEqual({
      vendor: "Example Inc.",
      primaryCategory: "manage-projects-teams",
      officialEvidence: [sourceUrl],
    });
  });

  it("rejects facts whose cited excerpt is absent", () => {
    const input = candidate({
      capabilities: [
        {
          value: "Artificial intelligence",
          citations: citation("AI creates every project automatically"),
        },
      ],
    });

    expect(processProductCandidate(input, context)).toMatchObject({
      decision: "EXCEPTION",
      reasons: [{ code: "UNSUPPORTED_FACT" }],
    });
  });

  it("rejects non-HTTPS official destinations", () => {
    const input = candidate({ officialUrl: "http://example.com/product" });

    expect(processProductCandidate(input, context).reasons).toContainEqual(
      expect.objectContaining({ code: "INVALID_OFFICIAL_URL" }),
    );
  });

  it("rejects unknown or low-confidence categories", () => {
    const input = candidate({
      primaryCategory: {
        slug: "unknown",
        confidence: 0.7,
        citations: citation("Project management helps teams coordinate work."),
      },
    });

    expect(processProductCandidate(input, context).reasons).toContainEqual(
      expect.objectContaining({ code: "CATEGORY_UNRESOLVED" }),
    );
  });

  it("detects an existing product by canonical slug", () => {
    const populatedContext: ProductFactoryContext = {
      ...context,
      software: [
        {
          id: "existing-example",
          slug: "example-product",
          name: "Example Product",
          vendorId: "example-vendor",
          vendorName: "Example Inc.",
          officialUrl: sourceUrl,
        },
      ],
    };

    expect(processProductCandidate(candidate(), populatedContext).reasons).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_EXISTING_PRODUCT" }),
    );
  });

  it("does not collapse a distinct sibling product under the same vendor", () => {
    const siblingContext: ProductFactoryContext = {
      ...context,
      software: [
        {
          id: "hubspot",
          slug: "hubspot",
          name: "HubSpot",
          vendorId: "vendor-hubspot",
          vendorName: "HubSpot",
          officialUrl: "https://www.hubspot.com",
        },
        {
          id: "hubspot-crm",
          slug: "hubspot-crm",
          name: "HubSpot CRM",
          vendorId: "vendor-hubspot",
          vendorName: "HubSpot",
          officialUrl: "https://www.hubspot.com/products/crm",
        },
      ],
      vendors: [
        {
          id: "vendor-hubspot",
          slug: "hubspot",
          name: "HubSpot",
          officialUrl: "https://www.hubspot.com",
        },
      ],
    };
    const hubspotContent =
      "HubSpot Marketing Hub is made by HubSpot. Marketing automation tools help teams create campaigns. Project management helps teams coordinate work.";
    const input = candidate({
      source: {
        providerKey: "official_web",
        externalObjectType: "product",
        externalId: "hubspot.com/products/marketing",
      },
      productName: {
        value: "HubSpot Marketing Hub",
        citations: [
          {
            sourceUrl: "https://www.hubspot.com/products/marketing",
            quote: "HubSpot Marketing Hub",
          },
        ],
      },
      vendorName: {
        value: "HubSpot",
        citations: [{ sourceUrl: "https://www.hubspot.com/products/marketing", quote: "HubSpot" }],
      },
      officialUrl: "https://www.hubspot.com/products/marketing",
      description: {
        value: "Marketing automation tools help teams create campaigns.",
        citations: [
          {
            sourceUrl: "https://www.hubspot.com/products/marketing",
            quote: "Marketing automation tools help teams create campaigns.",
          },
        ],
      },
      primaryCategory: {
        slug: "manage-projects-teams",
        confidence: 0.95,
        citations: [
          {
            sourceUrl: "https://www.hubspot.com/products/marketing",
            quote: "Project management helps teams coordinate work.",
          },
        ],
      },
      capabilities: [
        {
          value: "Marketing automation",
          citations: [
            {
              sourceUrl: "https://www.hubspot.com/products/marketing",
              quote: "Marketing automation tools",
            },
          ],
        },
      ],
      evidence: [
        {
          url: "https://www.hubspot.com/products/marketing",
          retrievedAt,
          sourceType: "official_product",
          httpStatus: 200,
          content: hubspotContent,
        },
      ],
    });

    const result = processProductCandidate(input, siblingContext);
    expect(result.reasons).toEqual([]);
    expect(result).toMatchObject({
      decision: "READY",
      payload: {
        vendor: {
          resolution: "existing",
          vendorId: "vendor-hubspot",
        },
        software: {
          slug: "hubspot-marketing-hub",
        },
      },
    });
  });

  it("rejects duplicate provider objects inside one batch", () => {
    const batch = runProductFactoryBatch([candidate(), candidate()], context);

    expect(batch).toMatchObject({
      processed: 2,
      ready: 1,
      exceptions: 1,
      duplicatesDetected: 1,
      manualProductEntryActionsRequired: 0,
    });
  });

  it("produces deterministic output on rerun", () => {
    const first = runProductFactoryBatch([candidate()], context);
    const second = runProductFactoryBatch([candidate()], context);

    expect(second).toEqual(first);
  });

  it("carries monetization discovery metadata without affecting the quality decision", () => {
    const result = processProductCandidate(
      candidate({ monetizationClassification: "NETWORK_OR_MARKETPLACE_OPPORTUNITY" }),
      context,
    );

    expect(result).toMatchObject({
      decision: "READY",
      monetizationClassification: "NETWORK_OR_MARKETPLACE_OPPORTUNITY",
    });
  });

  it("merges multiple acquired excerpts from the same official URL", () => {
    const input = candidate({
      description: {
        value: "Plan projects with shared boards and automate team workflows.",
        citations: citation("Plan projects with shared boards."),
      },
      capabilities: [
        {
          value: "Shared project boards",
          citations: citation("shared boards"),
        },
        {
          value: "Workflow automation",
          citations: citation("automate team workflows"),
        },
      ],
      evidence: [
        {
          url: sourceUrl,
          retrievedAt,
          sourceType: "official_product",
          httpStatus: 200,
          content:
            "Example Product is made by Example Inc. Plan projects with shared boards. Project management helps teams coordinate work.",
        },
        {
          url: sourceUrl,
          retrievedAt,
          sourceType: "official_product",
          httpStatus: 200,
          content: "Automate team workflows. Pricing starts at $10 per user.",
        },
      ],
    });

    expect(processProductCandidate(input, context).decision).toBe("READY");
  });

  it("uses an injected evidence acquirer before the same quality gate", async () => {
    const { evidence, ...discovered } = candidate();
    const batch = await acquireAndRunProductFactoryBatch([discovered], context, {
      acquire: async () => evidence,
    });

    expect(batch.ready).toBe(1);
  });
});
