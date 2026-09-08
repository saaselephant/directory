import { describe, expect, it } from "vitest";

import { buildBatchReporting } from "./cli";
import type {
  ProductFactoryBatchResult,
  ProductFactoryCandidate,
  ProductFactoryResult,
} from "./product-factory";

function result(
  candidate: string,
  decision: ProductFactoryResult["decision"],
): ProductFactoryResult {
  return {
    candidate,
    decision,
    reasons:
      decision === "READY"
        ? []
        : [{ code: "DUPLICATE_EXISTING_PRODUCT", message: "Already present." }],
    payload: null,
    review: {
      vendor: `${candidate} Vendor`,
      primaryCategory: "manage-projects-teams",
      officialEvidence: [`https://${candidate.toLowerCase()}.example`],
      indiaRelevance: candidate === "India Product",
      indiaRelevanceNote: candidate === "India Product" ? "Founded in India." : null,
    },
  };
}

function candidate(name: string, indiaRelevance: boolean): ProductFactoryCandidate {
  const url = `https://${name.toLowerCase().replaceAll(" ", "-")}.example`;
  return {
    source: { providerKey: "official_web", externalObjectType: "product", externalId: name },
    productName: { value: name, citations: [{ sourceUrl: url, quote: name }] },
    vendorName: { value: `${name} Vendor`, citations: [{ sourceUrl: url, quote: name }] },
    officialUrl: url,
    description: {
      value: `${name} provides supported team collaboration capabilities for businesses.`,
      citations: [{ sourceUrl: url, quote: "team collaboration" }],
    },
    primaryCategory: {
      slug: "manage-projects-teams",
      confidence: 0.95,
      citations: [{ sourceUrl: url, quote: "team collaboration" }],
    },
    capabilities: [
      { value: "Team collaboration", citations: [{ sourceUrl: url, quote: "team collaboration" }] },
    ],
    evidence: [
      {
        url,
        retrievedAt: "2026-09-08T12:00:00Z",
        sourceType: "official_product",
        httpStatus: name === "Existing Product" ? 403 : 200,
        content: `${name} team collaboration`,
      },
    ],
    indiaRelevance,
    indiaRelevanceNote: indiaRelevance ? "Founded in India." : undefined,
  };
}

describe("Product Factory batch reporting", () => {
  it("summarizes scale, category, evidence, conflict, and India metrics", () => {
    const results = [result("India Product", "READY"), result("Existing Product", "EXCEPTION")];
    const batch: ProductFactoryBatchResult = {
      processed: 2,
      ready: 1,
      exceptions: 1,
      duplicatesDetected: 1,
      manualProductEntryActionsRequired: 0,
      results,
    };

    expect(
      buildBatchReporting(
        batch,
        [candidate("India Product", true), candidate("Existing Product", false)],
        {
          "manage-projects-teams": 16,
        },
        20,
        6,
      ),
    ).toEqual({
      publishedCountBefore: 20,
      projectedPublishedCount: 21,
      uncategorizedBefore: 6,
      categoryCountsBefore: { "manage-projects-teams": 16 },
      candidateCountsByCategory: { "manage-projects-teams": 2 },
      readyCountsByCategory: { "manage-projects-teams": 1 },
      projectedCountsByCategory: { "manage-projects-teams": 17 },
      preExistingConflicts: 1,
      identityConflicts: 0,
      indiaRelevantCandidates: 1,
      indiaRelevantReady: 1,
      evidenceDocuments: 2,
      successfulEvidenceDocuments: 1,
      uniqueEvidenceUrls: 2,
      http403: 1,
      http429: 0,
      duplicateDescriptions: 0,
    });
  });
});
