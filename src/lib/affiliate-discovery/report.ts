import {
  matchAffiliateCandidate,
  type AffiliateSoftwareInventoryItem,
  type ReviewedAffiliateBinding,
} from "./match";
import { findCandidateDuplicates, normalizeDomain, normalizeName } from "./normalize";
import type { AffiliateProgramCandidate } from "./types";

export const REVIEW_CATEGORIES = [
  "EXISTING_CATALOG_MATCH",
  "UNMATCHED_COMMERCIAL_OPPORTUNITY",
  "AMBIGUOUS_REVIEW_REQUIRED",
  "DUPLICATE_OR_INVALID",
] as const;
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];

export interface BusinessReviewEntry {
  inputIndex: number;
  category: ReviewCategory;
  evidence: string[];
  candidate: AffiliateProgramCandidate;
}

/** Reject an unusable inventory rather than misreporting every row as an opportunity. */
export function parseSoftwareInventory(input: unknown): AffiliateSoftwareInventoryItem[] {
  if (!Array.isArray(input)) throw new Error("Inventory must be a JSON array.");
  const ids = new Set<string>();
  const slugs = new Set<string>();
  return input.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error(`Invalid inventory row ${index}.`);
    const row = raw as Record<string, unknown>;
    for (const key of ["id", "slug", "name"]) {
      if (typeof row[key] !== "string" || !(row[key] as string).trim())
        throw new Error(`Inventory row ${index}: ${key} is required.`);
    }
    for (const key of ["vendorName", "websiteUrl"]) {
      if (row[key] != null && typeof row[key] !== "string")
        throw new Error(`Inventory row ${index}: invalid ${key}.`);
    }
    const item: AffiliateSoftwareInventoryItem = {
      id: (row.id as string).trim(),
      slug: (row.slug as string).trim(),
      name: (row.name as string).trim(),
      vendorName: (row.vendorName as string | null | undefined) ?? null,
      websiteUrl: (row.websiteUrl as string | null | undefined) ?? null,
    };
    if (item.websiteUrl && !normalizeDomain(item.websiteUrl))
      throw new Error(`Inventory row ${index}: invalid HTTPS websiteUrl.`);
    if (ids.has(item.id) || slugs.has(item.slug.toLowerCase()))
      throw new Error(`Inventory row ${index}: duplicate ID or slug.`);
    ids.add(item.id);
    slugs.add(item.slug.toLowerCase());
    return item;
  });
}

/** Extra report gate: disagreeing exact identities must not silently win by tier order. */
function identityConflicts(
  candidate: AffiliateProgramCandidate,
  inventory: readonly AffiliateSoftwareInventoryItem[],
): string[] {
  const evidence: { label: string; ids: Set<string> }[] = [];
  for (const domain of candidate.domains.map(normalizeDomain)) {
    if (domain)
      evidence.push({
        label: `domain ${domain}`,
        ids: new Set(
          inventory
            .filter((item) => normalizeDomain(item.websiteUrl) === domain)
            .map((item) => item.id),
        ),
      });
  }
  const slug = normalizeName(candidate.softwareSlugHint).replace(/\s+/g, "-");
  if (slug)
    evidence.push({
      label: `slug ${slug}`,
      ids: new Set(
        inventory.filter((item) => item.slug.toLowerCase() === slug).map((item) => item.id),
      ),
    });
  const product = normalizeName(candidate.productName);
  if (product)
    evidence.push({
      label: `product ${candidate.productName}`,
      ids: new Set(
        inventory.filter((item) => normalizeName(item.name) === product).map((item) => item.id),
      ),
    });
  const resolved = evidence.filter((item) => item.ids.size > 0);
  if (resolved.length < 2) return [];
  const shared = [...resolved[0].ids].filter((id) => resolved.every((item) => item.ids.has(id)));
  return shared.length
    ? []
    : [`Conflicting exact identity evidence: ${resolved.map((item) => item.label).join("; ")}.`];
}

export function createBusinessReviewReport(
  candidates: readonly AffiliateProgramCandidate[],
  inventory: readonly AffiliateSoftwareInventoryItem[],
  reviewedBindings: readonly ReviewedAffiliateBinding[] = [],
) {
  const duplicates = findCandidateDuplicates(candidates);
  const duplicateEvidence = new Map<number, string[]>();
  for (const duplicate of duplicates) {
    for (const index of duplicate.candidateIndexes) {
      duplicateEvidence.set(index, [
        duplicate.evidence,
        `Input indexes: ${duplicate.candidateIndexes.join(", ")}. All copies held for review.`,
      ]);
    }
  }
  const entries: BusinessReviewEntry[] = candidates.map((candidate, inputIndex) => {
    const errors = candidate.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => `${issue.field ?? issue.code}: ${issue.message}`);
    const duplicate = duplicateEvidence.get(inputIndex) ?? [];
    if (errors.length || duplicate.length)
      return {
        inputIndex,
        category: "DUPLICATE_OR_INVALID",
        evidence: [...errors, ...duplicate],
        candidate: { ...candidate, match: null, reviewStatus: "deferred" },
      };
    const match = matchAffiliateCandidate(candidate, inventory, reviewedBindings);
    const formerNames = new Set((candidate.commercial?.formerNames ?? []).map(normalizeName));
    const formerMatches = inventory.filter(
      (item) => formerNames.has(normalizeName(item.name)) && item.id !== match?.softwareId,
    );
    const conflicts = [
      ...(formerMatches.length
        ? [
            `Former name matches existing catalog records: ${formerMatches.map((item) => item.slug).join(", ")}. Review the rename before matching or adding a listing.`,
          ]
        : []),
      ...candidate.issues
        .filter((issue) => issue.code === "identity_conflict")
        .map((issue) => issue.message),
      ...identityConflicts(candidate, inventory),
    ];
    if (conflicts.length || match?.decision === "ambiguous")
      return {
        inputIndex,
        category: "AMBIGUOUS_REVIEW_REQUIRED",
        evidence: [...conflicts, ...(match?.reasons ?? [])],
        candidate: {
          ...candidate,
          reviewStatus: "ambiguous",
          match: {
            softwareId: null,
            slug: null,
            confidence: 0,
            decision: "ambiguous",
            reasons: [...conflicts, ...(match?.reasons ?? [])],
          },
        },
      };
    return {
      inputIndex,
      category: match ? "EXISTING_CATALOG_MATCH" : "UNMATCHED_COMMERCIAL_OPPORTUNITY",
      evidence: match?.reasons ?? [
        "No deterministic match in the supplied inventory. Review commercial fit and catalog completeness before creating a listing.",
      ],
      candidate: { ...candidate, match, reviewStatus: match ? "ready_for_review" : "unmatched" },
    };
  });
  const groups = Object.fromEntries(
    REVIEW_CATEGORIES.map((category) => [
      category,
      entries.filter((entry) => entry.category === category),
    ]),
  ) as Record<ReviewCategory, BusinessReviewEntry[]>;
  return {
    scope:
      "Offline review only. Catalog matches are relative to the supplied inventory; no import, verification or activation is authorized.",
    inputCount: candidates.length,
    inventoryCount: inventory.length,
    summary: Object.fromEntries(
      REVIEW_CATEGORIES.map((category) => [category, groups[category].length]),
    ) as Record<ReviewCategory, number>,
    groups,
  };
}
