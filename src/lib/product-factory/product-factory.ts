import {
  createProviderObjectKey,
  matchProviderIdentity,
  normalizeIdentityDomain,
  normalizeIdentityName,
  normalizeIdentitySlug,
  type CanonicalIdentityClaim,
  type CanonicalIdentityEntity,
  type ExistingExternalIdentity,
} from "../identity/provider-identity";

export const PRODUCT_FACTORY_REASON_CODES = [
  "DUPLICATE_EXISTING_PRODUCT",
  "AMBIGUOUS_IDENTITY",
  "NO_AUTHORITATIVE_SOURCE",
  "INSUFFICIENT_PRODUCT_EVIDENCE",
  "CATEGORY_UNRESOLVED",
  "INVALID_OFFICIAL_URL",
  "MISSING_REQUIRED_FIELD",
  "CONFLICTING_EVIDENCE",
  "UNSUPPORTED_FACT",
] as const;

export type ProductFactoryReasonCode = (typeof PRODUCT_FACTORY_REASON_CODES)[number];
export type ProductFactoryDecision = "READY" | "EXCEPTION";
export const MONETIZATION_CLASSIFICATIONS = [
  "KNOWN_EXISTING_MONETIZATION",
  "NETWORK_OR_MARKETPLACE_OPPORTUNITY",
  "PUBLIC_AFFILIATE_PROGRAM_FOUND",
  "NO_MONETIZATION_FOUND_YET",
  "UNKNOWN",
] as const;
export type MonetizationClassification = (typeof MONETIZATION_CLASSIFICATIONS)[number];

export interface EvidenceCitation {
  sourceUrl: string;
  quote: string;
}

export interface SourcedText {
  value: string;
  citations: EvidenceCitation[];
}

export interface SourcedCategory {
  slug: string;
  confidence: number;
  citations: EvidenceCitation[];
}

export interface ProductEvidenceDocument {
  url: string;
  retrievedAt: string;
  sourceType: "official_product" | "official_vendor" | "official_docs" | "official_pricing";
  httpStatus: number;
  content: string;
}

export interface ProductFactoryCandidate {
  source: {
    providerKey: string;
    externalObjectType: string;
    externalId: string;
  };
  productName: SourcedText;
  vendorName: SourcedText;
  officialUrl: string;
  requestedSlug?: string | null;
  description: SourcedText;
  primaryCategory: SourcedCategory;
  additionalCategories?: SourcedCategory[];
  capabilities: SourcedText[];
  pricing?: SourcedText | null;
  evidence: ProductEvidenceDocument[];
  monetizationClassification?: MonetizationClassification;
}

export type DiscoveredProductCandidate = Omit<ProductFactoryCandidate, "evidence">;

export interface ProductEvidenceAcquirer {
  acquire(candidate: DiscoveredProductCandidate): Promise<ProductEvidenceDocument[]>;
}

export interface ProductFactoryCatalogItem {
  id: string;
  slug: string;
  name: string;
  vendorId: string | null;
  vendorName: string;
  officialUrl: string;
}

export interface ProductFactoryVendor {
  id: string;
  slug: string;
  name: string;
  officialUrl: string | null;
}

export interface ProductFactoryCategory {
  id: string;
  slug: string;
  name: string;
}

export interface ProductFactoryContext {
  software: readonly ProductFactoryCatalogItem[];
  vendors: readonly ProductFactoryVendor[];
  categories: readonly ProductFactoryCategory[];
  identityEntities?: readonly CanonicalIdentityEntity[];
  identityClaims?: readonly CanonicalIdentityClaim[];
  externalIdentities?: readonly ExistingExternalIdentity[];
}

export interface ProductFactoryExceptionReason {
  code: ProductFactoryReasonCode;
  message: string;
}

export interface ProductFactoryReadyPayload {
  idempotencyKey: string;
  vendor: {
    resolution: "existing" | "create";
    vendorId: string | null;
    vendor_name: string;
    slug: string;
    website_url: string;
  };
  software: {
    software_id: null;
    software_name: string;
    vendor: string;
    vendor_id: string | null;
    slug: string;
    website_url: string;
    short_description: string;
    full_description: null;
    best_for: null;
    key_features: string;
    pricing: string | null;
    free_plan: null;
    free_trial: null;
    status: "Candidate";
    publication_status: "in_review";
    verification_status: "needs_verification";
    verified_at: null;
  };
  categories: Array<{
    category_id: string;
    slug: string;
    primary_category: boolean;
  }>;
  officialOutboundDestination: string;
  provenance: Array<{
    url: string;
    retrievedAt: string;
    sourceType: ProductEvidenceDocument["sourceType"];
  }>;
}

export interface ProductFactoryResult {
  candidate: string;
  decision: ProductFactoryDecision;
  reasons: ProductFactoryExceptionReason[];
  payload: ProductFactoryReadyPayload | null;
  monetizationClassification?: MonetizationClassification;
  review?: {
    vendor: string;
    primaryCategory: string;
    officialEvidence: string[];
  };
}

export interface ProductFactoryBatchResult {
  processed: number;
  ready: number;
  exceptions: number;
  duplicatesDetected: number;
  manualProductEntryActionsRequired: number;
  results: ProductFactoryResult[];
}

function canonicalHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !url.hostname.includes(".")
    ) {
      return null;
    }
    url.hash = "";
    url.search = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href;
  } catch {
    return null;
  }
}

function slugify(value: string): string {
  return normalizeIdentityName(value).replace(/\s+/g, "-");
}

function normalizedEvidence(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
}

function sourceIsOfficial(sourceUrl: string, officialDomain: string): boolean {
  const sourceDomain = normalizeIdentityDomain(sourceUrl);
  return (
    sourceDomain !== null &&
    (sourceDomain === officialDomain ||
      sourceDomain.endsWith(`.${officialDomain}`) ||
      officialDomain.endsWith(`.${sourceDomain}`))
  );
}

function validRetrievedAt(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function verifyCitations(
  factName: string,
  citations: readonly EvidenceCitation[],
  evidenceByUrl: ReadonlyMap<string, ProductEvidenceDocument>,
  officialDomain: string,
): ProductFactoryExceptionReason[] {
  if (citations.length === 0) {
    return [
      {
        code: "INSUFFICIENT_PRODUCT_EVIDENCE",
        message: `${factName} has no evidence citation.`,
      },
    ];
  }

  const failures: ProductFactoryExceptionReason[] = [];
  for (const citation of citations) {
    const canonicalUrl = canonicalHttpsUrl(citation.sourceUrl);
    const evidence = canonicalUrl ? evidenceByUrl.get(canonicalUrl) : null;
    if (!canonicalUrl || !sourceIsOfficial(canonicalUrl, officialDomain) || !evidence) {
      failures.push({
        code: "CONFLICTING_EVIDENCE",
        message: `${factName} cites a source outside the acquired official evidence set.`,
      });
      continue;
    }
    const quote = normalizedEvidence(citation.quote);
    if (quote.length < 3 || !normalizedEvidence(evidence.content).includes(quote)) {
      failures.push({
        code: "UNSUPPORTED_FACT",
        message: `${factName} is not supported by its cited source excerpt.`,
      });
    }
  }
  return failures;
}

function uniqueReasons(
  reasons: readonly ProductFactoryExceptionReason[],
): ProductFactoryExceptionReason[] {
  return [
    ...new Map(
      reasons.map((reason) => [`${reason.code}:${reason.message}`, reason] as const),
    ).values(),
  ];
}

function reviewMetadata(
  candidate: ProductFactoryCandidate,
): NonNullable<ProductFactoryResult["review"]> {
  return {
    vendor: candidate.vendorName.value.trim(),
    primaryCategory: candidate.primaryCategory.slug.trim(),
    officialEvidence: [...new Set(candidate.evidence.map((item) => item.url))].sort((left, right) =>
      left.localeCompare(right, "en"),
    ),
  };
}

export function processProductCandidate(
  candidate: ProductFactoryCandidate,
  context: ProductFactoryContext,
): ProductFactoryResult {
  const reasons: ProductFactoryExceptionReason[] = [];
  const productName = candidate.productName.value.trim();
  const vendorName = candidate.vendorName.value.trim();
  const slug = normalizeIdentitySlug(candidate.requestedSlug) || slugify(productName);
  const officialUrl = canonicalHttpsUrl(candidate.officialUrl);
  const officialDomain = normalizeIdentityDomain(officialUrl);

  try {
    createProviderObjectKey(
      candidate.source.providerKey,
      candidate.source.externalObjectType,
      candidate.source.externalId,
    );
  } catch {
    reasons.push({
      code: "MISSING_REQUIRED_FIELD",
      message: "Provider key, object type and external ID must form a valid identity key.",
    });
  }

  if (!productName || !vendorName || !slug || !candidate.description.value.trim()) {
    reasons.push({
      code: "MISSING_REQUIRED_FIELD",
      message: "Product name, vendor name, slug and description are required.",
    });
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug) || slug.length > 200) {
    reasons.push({
      code: "MISSING_REQUIRED_FIELD",
      message: "The canonical slug is not valid.",
    });
  }
  if (!officialUrl || !officialDomain) {
    reasons.push({
      code: "INVALID_OFFICIAL_URL",
      message: "The official destination must be a valid HTTPS URL without credentials or ports.",
    });
  }

  const evidenceByUrl = new Map<string, ProductEvidenceDocument>();
  if (officialDomain) {
    for (const evidence of candidate.evidence) {
      const evidenceUrl = canonicalHttpsUrl(evidence.url);
      if (
        evidenceUrl &&
        evidence.httpStatus === 200 &&
        validRetrievedAt(evidence.retrievedAt) &&
        sourceIsOfficial(evidenceUrl, officialDomain)
      ) {
        const existing = evidenceByUrl.get(evidenceUrl);
        evidenceByUrl.set(
          evidenceUrl,
          existing
            ? {
                ...existing,
                content: `${existing.content}\n${evidence.content}`,
              }
            : evidence,
        );
      }
    }
  }
  if (evidenceByUrl.size === 0) {
    reasons.push({
      code: "NO_AUTHORITATIVE_SOURCE",
      message: "No successful, timestamped first-party evidence was acquired.",
    });
  }

  if (officialDomain) {
    for (const [factName, fact] of [
      ["Product name", candidate.productName],
      ["Vendor name", candidate.vendorName],
      ["Description", candidate.description],
      ...candidate.capabilities.map(
        (capability, index) => [`Capability ${index + 1}`, capability] as const,
      ),
      ...(candidate.pricing ? ([["Pricing", candidate.pricing]] as const) : []),
    ] as const) {
      reasons.push(...verifyCitations(factName, fact.citations, evidenceByUrl, officialDomain));
    }
    reasons.push(
      ...verifyCitations(
        "Primary category",
        candidate.primaryCategory.citations,
        evidenceByUrl,
        officialDomain,
      ),
    );
    for (const [index, category] of (candidate.additionalCategories ?? []).entries()) {
      reasons.push(
        ...verifyCitations(
          `Additional category ${index + 1}`,
          category.citations,
          evidenceByUrl,
          officialDomain,
        ),
      );
    }
  }

  if (candidate.capabilities.length === 0) {
    reasons.push({
      code: "INSUFFICIENT_PRODUCT_EVIDENCE",
      message: "At least one supported product capability is required.",
    });
  }
  const description = candidate.description.value.trim();
  if (description.length < 40 || description.length > 320) {
    reasons.push({
      code: "UNSUPPORTED_FACT",
      message: "The factual description must be between 40 and 320 characters.",
    });
  }

  const categoryBySlug = new Map(
    context.categories.map((category) => [normalizeIdentitySlug(category.slug), category]),
  );
  const requestedCategories = [
    { ...candidate.primaryCategory, primary: true },
    ...(candidate.additionalCategories ?? []).map((category) => ({
      ...category,
      primary: false,
    })),
  ];
  const resolvedCategories = requestedCategories.flatMap((category) => {
    const resolved = categoryBySlug.get(normalizeIdentitySlug(category.slug));
    if (!resolved || category.confidence < 0.9) {
      reasons.push({
        code: "CATEGORY_UNRESOLVED",
        message: `Category "${category.slug}" is unavailable or lacks sufficient evidence.`,
      });
      return [];
    }
    return [{ ...resolved, primary: category.primary }];
  });

  const normalizedProductName = normalizeIdentityName(productName);
  const normalizedVendorName = normalizeIdentityName(vendorName);
  const exactSlugMatches = context.software.filter(
    (item) => normalizeIdentitySlug(item.slug) === slug,
  );
  const exactNameVendorMatches = context.software.filter(
    (item) =>
      normalizeIdentityName(item.name) === normalizedProductName &&
      normalizeIdentityName(item.vendorName) === normalizedVendorName,
  );
  const duplicateMatches = new Map(
    [...exactSlugMatches, ...exactNameVendorMatches].map((item) => [item.id, item]),
  );
  if (duplicateMatches.size > 0) {
    reasons.push({
      code: "DUPLICATE_EXISTING_PRODUCT",
      message: `Deterministic catalog identity matched: ${[...duplicateMatches.values()]
        .map((item) => item.slug)
        .join(", ")}.`,
    });
  }

  const exactNameOtherVendor = context.software.filter(
    (item) =>
      normalizeIdentityName(item.name) === normalizedProductName &&
      normalizeIdentityName(item.vendorName) !== normalizedVendorName,
  );
  if (exactNameOtherVendor.length > 0) {
    reasons.push({
      code: "AMBIGUOUS_IDENTITY",
      message: "The exact product name exists under a different vendor.",
    });
  }

  const vendorMatches = context.vendors.filter(
    (vendor) => normalizeIdentityName(vendor.name) === normalizedVendorName,
  );
  if (vendorMatches.length > 1) {
    reasons.push({
      code: "AMBIGUOUS_IDENTITY",
      message: "The vendor name resolves to multiple canonical vendors.",
    });
  }
  const vendor = vendorMatches.length === 1 ? vendorMatches[0] : null;
  const requestedVendorSlug = slugify(vendorName);
  if (
    !vendor &&
    context.vendors.some(
      (item) =>
        normalizeIdentitySlug(item.slug) === requestedVendorSlug &&
        normalizeIdentityName(item.name) !== normalizedVendorName,
    )
  ) {
    reasons.push({
      code: "CONFLICTING_EVIDENCE",
      message: "The proposed vendor slug belongs to a differently named vendor.",
    });
  }

  if (officialDomain && context.identityEntities && context.identityClaims) {
    const identityResult = matchProviderIdentity({
      record: {
        providerKey: candidate.source.providerKey,
        externalObjectType: candidate.source.externalObjectType,
        externalId: candidate.source.externalId,
        targetKind: "software",
        displayName: productName,
        externalSlug: slug,
        domain: officialDomain,
        confirmedVendorId: vendor?.id ?? null,
      },
      entities: context.identityEntities,
      claims: context.identityClaims,
      existingIdentities: context.externalIdentities,
    });
    if (identityResult.decision === "auto_bind" || identityResult.decision === "refresh") {
      reasons.push({
        code: "DUPLICATE_EXISTING_PRODUCT",
        message: `Canonical identity evidence matched ${identityResult.target?.id ?? "an existing product"}.`,
      });
    } else if (identityResult.decision === "review") {
      reasons.push({
        code: "AMBIGUOUS_IDENTITY",
        message: identityResult.reasons.join(" "),
      });
    }
  }

  const finalReasons = uniqueReasons(reasons);
  if (finalReasons.length > 0 || !officialUrl) {
    return {
      candidate: productName || candidate.source.externalId,
      decision: "EXCEPTION",
      reasons: finalReasons,
      payload: null,
      monetizationClassification: candidate.monetizationClassification,
      review: reviewMetadata(candidate),
    };
  }

  const idempotencyKey = createProviderObjectKey(
    candidate.source.providerKey,
    candidate.source.externalObjectType,
    candidate.source.externalId,
  );
  return {
    candidate: productName,
    decision: "READY",
    reasons: [],
    monetizationClassification: candidate.monetizationClassification,
    review: reviewMetadata(candidate),
    payload: {
      idempotencyKey,
      vendor: {
        resolution: vendor ? "existing" : "create",
        vendorId: vendor?.id ?? null,
        vendor_name: vendorName,
        slug: vendor?.slug ?? requestedVendorSlug,
        website_url: `https://${officialDomain}`,
      },
      software: {
        software_id: null,
        software_name: productName,
        vendor: vendorName,
        vendor_id: vendor?.id ?? null,
        slug,
        website_url: officialUrl,
        short_description: description,
        full_description: null,
        best_for: null,
        key_features: candidate.capabilities
          .map((capability) => capability.value.trim())
          .join("; "),
        pricing: candidate.pricing?.value.trim() || null,
        free_plan: null,
        free_trial: null,
        status: "Candidate",
        publication_status: "in_review",
        verification_status: "needs_verification",
        verified_at: null,
      },
      categories: resolvedCategories.map((category) => ({
        category_id: category.id,
        slug: category.slug,
        primary_category: category.primary,
      })),
      officialOutboundDestination: officialUrl,
      provenance: [...evidenceByUrl.values()]
        .map(({ url, retrievedAt, sourceType }) => ({ url, retrievedAt, sourceType }))
        .sort((left, right) => left.url.localeCompare(right.url, "en")),
    },
  };
}

export function runProductFactoryBatch(
  candidates: readonly ProductFactoryCandidate[],
  context: ProductFactoryContext,
): ProductFactoryBatchResult {
  const seenProviderObjects = new Set<string>();
  const results = candidates.map((candidate) => {
    let key: string | null = null;
    try {
      key = createProviderObjectKey(
        candidate.source.providerKey,
        candidate.source.externalObjectType,
        candidate.source.externalId,
      );
    } catch {
      // The candidate-level gate returns the inspectable reason.
    }
    if (key && seenProviderObjects.has(key)) {
      return {
        candidate: candidate.productName.value.trim() || candidate.source.externalId,
        decision: "EXCEPTION" as const,
        reasons: [
          {
            code: "DUPLICATE_EXISTING_PRODUCT" as const,
            message: "The provider object is duplicated within this batch.",
          },
        ],
        payload: null,
        monetizationClassification: candidate.monetizationClassification,
        review: reviewMetadata(candidate),
      };
    }

    if (key) seenProviderObjects.add(key);
    return processProductCandidate(candidate, context);
  });

  return {
    processed: results.length,
    ready: results.filter((result) => result.decision === "READY").length,
    exceptions: results.filter((result) => result.decision === "EXCEPTION").length,
    duplicatesDetected: results.filter((result) =>
      result.reasons.some((reason) => reason.code === "DUPLICATE_EXISTING_PRODUCT"),
    ).length,
    manualProductEntryActionsRequired: 0,
    results,
  };
}

export async function acquireAndRunProductFactoryBatch(
  candidates: readonly DiscoveredProductCandidate[],
  context: ProductFactoryContext,
  acquirer: ProductEvidenceAcquirer,
): Promise<ProductFactoryBatchResult> {
  const evidencedCandidates: ProductFactoryCandidate[] = [];
  for (const candidate of candidates) {
    evidencedCandidates.push({
      ...candidate,
      evidence: await acquirer.acquire(candidate),
    });
  }
  return runProductFactoryBatch(evidencedCandidates, context);
}
