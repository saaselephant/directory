export const IDENTITY_MATCH_STATES = [
  "unmatched",
  "ambiguous",
  "auto_matched",
  "reviewed_matched",
  "ignored",
  "retired",
] as const;

export type IdentityMatchState = (typeof IDENTITY_MATCH_STATES)[number];
export type CanonicalEntityKind = "software" | "vendor" | "category";
export type IdentityClaimType = "name" | "slug" | "domain";
export type IdentityClaimScope =
  | "canonical"
  | "official_vendor"
  | "product_specific"
  | "historical";
export type IdentityClaimStatus = "active" | "historical" | "disputed";
export type IdentityMatchMethod =
  | "reviewed_binding"
  | "provider_id"
  | "product_domain"
  | "alias"
  | "name_vendor"
  | "vendor_identity"
  | "fuzzy_suggestion";

export interface CanonicalIdentityTarget {
  kind: CanonicalEntityKind;
  id: string;
}

export interface CanonicalIdentityEntity extends CanonicalIdentityTarget {
  vendorId?: string | null;
}

export interface CanonicalIdentityClaim {
  target: CanonicalIdentityTarget;
  claimType: IdentityClaimType;
  claimScope: IdentityClaimScope;
  normalizedValue: string;
  status: IdentityClaimStatus;
  verifiedAt: string | null;
}

export interface ProviderIdentityRecord {
  providerKey: string;
  externalObjectType: string;
  externalId: string;
  targetKind: CanonicalEntityKind;
  displayName?: string | null;
  externalSlug?: string | null;
  domain?: string | null;
  confirmedVendorId?: string | null;
}

export interface ExistingExternalIdentity {
  externalIdentityId: string;
  providerKey: string;
  externalObjectType: string;
  externalId: string;
  matchState: IdentityMatchState;
  matchMethod: IdentityMatchMethod | null;
  confidence: number;
  target: CanonicalIdentityTarget | null;
}

export interface IdentityMatchResult {
  decision: "refresh" | "auto_bind" | "review" | "unmatched";
  matchState: IdentityMatchState;
  matchMethod: IdentityMatchMethod | null;
  confidence: number;
  target: CanonicalIdentityTarget | null;
  externalIdentityId: string | null;
  candidateTargets: CanonicalIdentityTarget[];
  reasons: string[];
}

export interface MatchProviderIdentityInput {
  record: ProviderIdentityRecord;
  /** Complete canonical set for validating persisted targets and product siblings. */
  entities: readonly CanonicalIdentityEntity[];
  claims: readonly CanonicalIdentityClaim[];
  existingIdentities?: readonly ExistingExternalIdentity[];
  fuzzySuggestions?: readonly CanonicalIdentityTarget[];
}

export function normalizeIdentityName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeIdentitySlug(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en");
}

export function normalizeIdentityDomain(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) {
      return null;
    }
    return url.hostname.toLocaleLowerCase("en").replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function createProviderObjectKey(
  providerKey: string,
  externalObjectType: string,
  externalId: string,
): string {
  const provider = normalizeIdentitySlug(providerKey);
  const objectType = normalizeIdentitySlug(externalObjectType);
  const id = externalId.trim();
  const normalizedKeyPattern = /^[a-z0-9][a-z0-9_-]*$/;
  if (!normalizedKeyPattern.test(provider) || !normalizedKeyPattern.test(objectType) || !id) {
    throw new Error("Provider key, object type and external ID are required.");
  }
  return JSON.stringify([provider, objectType, id]);
}

function targetKey(target: CanonicalIdentityTarget): string {
  return `${target.kind}:${target.id}`;
}

function uniqueTargets(targets: readonly CanonicalIdentityTarget[]): CanonicalIdentityTarget[] {
  return [...new Map(targets.map((target) => [targetKey(target), target] as const)).values()].sort(
    (left, right) => targetKey(left).localeCompare(targetKey(right), "en"),
  );
}

function reviewedActiveClaims(claims: readonly CanonicalIdentityClaim[]): CanonicalIdentityClaim[] {
  return claims.filter(
    (claim) =>
      claim.status === "active" && claim.verifiedAt !== null && claim.normalizedValue.trim() !== "",
  );
}

function ambiguous(
  reasons: string[],
  candidates: readonly CanonicalIdentityTarget[],
  externalIdentityId: string | null,
  matchMethod: IdentityMatchMethod | null = null,
): IdentityMatchResult {
  return {
    decision: "review",
    matchState: "ambiguous",
    matchMethod,
    confidence: 0,
    target: null,
    externalIdentityId,
    candidateTargets: uniqueTargets(candidates),
    reasons,
  };
}

function matchingEntity(
  target: CanonicalIdentityTarget,
  entities: readonly CanonicalIdentityEntity[],
): CanonicalIdentityEntity | null {
  return entities.find((entity) => entity.kind === target.kind && entity.id === target.id) ?? null;
}

export function matchProviderIdentity({
  record,
  entities,
  claims,
  existingIdentities = [],
  fuzzySuggestions = [],
}: MatchProviderIdentityInput): IdentityMatchResult {
  const providerKey = normalizeIdentitySlug(record.providerKey);
  const objectType = normalizeIdentitySlug(record.externalObjectType);
  const externalId = record.externalId.trim();
  createProviderObjectKey(providerKey, objectType, externalId);

  const existing = existingIdentities.filter(
    (identity) =>
      normalizeIdentitySlug(identity.providerKey) === providerKey &&
      normalizeIdentitySlug(identity.externalObjectType) === objectType &&
      identity.externalId.trim() === externalId,
  );
  if (existing.length > 1) {
    return ambiguous(
      ["Conflicting rows exist for the same provider object identity."],
      existing.flatMap((identity) => (identity.target ? [identity.target] : [])),
      null,
    );
  }

  const prior = existing[0];
  const priorTarget = prior?.target ? matchingEntity(prior.target, entities) : null;
  if (prior?.matchState === "reviewed_matched") {
    if (!priorTarget) {
      return ambiguous(
        ["The reviewed provider binding no longer resolves to a canonical entity."],
        prior.target ? [prior.target] : [],
        prior.externalIdentityId,
        "reviewed_binding",
      );
    }
    return {
      decision: "refresh",
      matchState: "reviewed_matched",
      matchMethod: "reviewed_binding",
      confidence: 100,
      target: priorTarget,
      externalIdentityId: prior.externalIdentityId,
      candidateTargets: [priorTarget],
      reasons: ["Preserved the existing reviewed provider-object binding."],
    };
  }
  if (prior?.matchState === "auto_matched" && priorTarget) {
    return {
      decision: "refresh",
      matchState: "auto_matched",
      matchMethod: prior.matchMethod,
      confidence: prior.confidence,
      target: priorTarget,
      externalIdentityId: prior.externalIdentityId,
      candidateTargets: [priorTarget],
      reasons: [
        "Refreshed the existing provider object without changing its canonical binding or evidence.",
      ],
    };
  }
  if (prior?.matchState === "ignored" || prior?.matchState === "retired") {
    return {
      decision: "refresh",
      matchState: prior.matchState,
      matchMethod: prior.matchMethod,
      confidence: prior.confidence,
      target: prior.target,
      externalIdentityId: prior.externalIdentityId,
      candidateTargets: prior.target ? [prior.target] : [],
      reasons: [`Preserved the existing ${prior.matchState} provider-object state.`],
    };
  }

  const eligibleClaims = reviewedActiveClaims(claims);
  const domain = normalizeIdentityDomain(record.domain);
  const slug = normalizeIdentitySlug(record.externalSlug);
  const name = normalizeIdentityName(record.displayName);
  const exactSignals: Array<{
    method: IdentityMatchMethod;
    confidence: number;
    reason: string;
    targets: CanonicalIdentityTarget[];
    canAutoBind: boolean;
  }> = [];

  let vendorEvidence = record.confirmedVendorId?.trim() || null;
  if (domain) {
    const vendorDomainTargets = uniqueTargets(
      eligibleClaims
        .filter(
          (claim) =>
            claim.target.kind === "vendor" &&
            claim.claimType === "domain" &&
            claim.claimScope === "official_vendor" &&
            claim.normalizedValue === domain,
        )
        .map((claim) => claim.target),
    );
    if (vendorDomainTargets.length > 1) {
      return ambiguous(
        [`Official vendor domain "${domain}" resolves to multiple vendors.`],
        vendorDomainTargets,
        prior?.externalIdentityId ?? null,
      );
    }
    if (
      vendorEvidence &&
      vendorDomainTargets.length === 1 &&
      vendorDomainTargets[0].id !== vendorEvidence
    ) {
      return ambiguous(
        ["Confirmed vendor evidence conflicts with the reviewed official domain."],
        [{ kind: "vendor", id: vendorEvidence }, vendorDomainTargets[0]],
        prior?.externalIdentityId ?? null,
      );
    }
    vendorEvidence ??= vendorDomainTargets[0]?.id ?? null;

    if (record.targetKind === "vendor" && vendorDomainTargets.length === 1) {
      exactSignals.push({
        method: "vendor_identity",
        confidence: 95,
        reason: `Matched unique reviewed official vendor domain "${domain}".`,
        targets: vendorDomainTargets,
        canAutoBind: true,
      });
    }
    if (record.targetKind === "software") {
      const productDomainTargets = uniqueTargets(
        eligibleClaims
          .filter(
            (claim) =>
              claim.target.kind === "software" &&
              claim.claimType === "domain" &&
              claim.claimScope === "product_specific" &&
              claim.normalizedValue === domain,
          )
          .map((claim) => claim.target),
      );
      if (productDomainTargets.length > 0) {
        exactSignals.push({
          method: "product_domain",
          confidence: 95,
          reason: `Matched reviewed product-specific domain "${domain}".`,
          targets: productDomainTargets,
          canAutoBind: true,
        });
      }
    }
  }

  if (slug) {
    const slugTargets = uniqueTargets(
      eligibleClaims
        .filter(
          (claim) =>
            claim.target.kind === record.targetKind &&
            claim.claimType === "slug" &&
            claim.claimScope !== "historical" &&
            claim.normalizedValue === slug,
        )
        .map((claim) => claim.target),
    );
    if (slugTargets.length > 0) {
      exactSignals.push({
        method: "alias",
        confidence: 90,
        reason: `Matched reviewed exact slug or alias "${slug}".`,
        targets: slugTargets,
        canAutoBind: true,
      });
    }
  }

  if (name && record.targetKind === "software") {
    const allNameTargets = uniqueTargets(
      eligibleClaims
        .filter(
          (claim) =>
            claim.target.kind === "software" &&
            claim.claimType === "name" &&
            claim.normalizedValue === name,
        )
        .map((claim) => claim.target),
    );
    const nameTargets = vendorEvidence
      ? allNameTargets.filter(
          (target) => matchingEntity(target, entities)?.vendorId === vendorEvidence,
        )
      : allNameTargets;
    if (nameTargets.length > 0) {
      exactSignals.push({
        method: "name_vendor",
        confidence: 85,
        reason: vendorEvidence
          ? "Matched an exact reviewed product name with confirmed vendor evidence."
          : "An exact reviewed product name matched without confirmed vendor evidence.",
        targets: nameTargets,
        canAutoBind: vendorEvidence !== null,
      });
    }
  } else if (name && record.targetKind !== "software") {
    const nameTargets = uniqueTargets(
      eligibleClaims
        .filter(
          (claim) =>
            claim.target.kind === record.targetKind &&
            claim.claimType === "name" &&
            claim.normalizedValue === name,
        )
        .map((claim) => claim.target),
    );
    if (nameTargets.length > 0) {
      exactSignals.push({
        method: record.targetKind === "vendor" ? "vendor_identity" : "alias",
        confidence: 80,
        reason: "Matched a unique reviewed canonical name or alias.",
        targets: nameTargets,
        canAutoBind: true,
      });
    }
  }

  const exactTargets = uniqueTargets(exactSignals.flatMap((signal) => signal.targets));
  const conflictingVendorTarget = exactTargets.find((target) => {
    if (target.kind !== "software" || !vendorEvidence) return false;
    return matchingEntity(target, entities)?.vendorId !== vendorEvidence;
  });
  if (conflictingVendorTarget) {
    return ambiguous(
      ["Exact product evidence conflicts with the confirmed vendor identity."],
      exactTargets,
      prior?.externalIdentityId ?? null,
    );
  }
  if (exactTargets.length > 1 || exactSignals.some((signal) => signal.targets.length > 1)) {
    return ambiguous(
      ["Exact identity signals do not resolve to one canonical entity."],
      exactTargets,
      prior?.externalIdentityId ?? null,
    );
  }
  if (exactTargets.length === 1) {
    const target = exactTargets[0];
    const winningSignal = exactSignals.find(
      (signal) =>
        signal.canAutoBind &&
        signal.targets.some((candidate) => targetKey(candidate) === targetKey(target)),
    );
    if (winningSignal) {
      return {
        decision: "auto_bind",
        matchState: "auto_matched",
        matchMethod: winningSignal.method,
        confidence: winningSignal.confidence,
        target,
        externalIdentityId: prior?.externalIdentityId ?? null,
        candidateTargets: [target],
        reasons: exactSignals.map((signal) => signal.reason),
      };
    }
  }

  if (record.targetKind === "software" && vendorEvidence) {
    const siblingProducts = entities.filter(
      (entity) => entity.kind === "software" && entity.vendorId === vendorEvidence,
    );
    if (siblingProducts.length > 0) {
      return ambiguous(
        ["Vendor identity alone cannot select a canonical software product."],
        siblingProducts,
        prior?.externalIdentityId ?? null,
      );
    }
  }

  const fuzzyTargets = uniqueTargets(
    fuzzySuggestions.filter(
      (target) => target.kind === record.targetKind && matchingEntity(target, entities) !== null,
    ),
  );
  if (fuzzyTargets.length > 0) {
    return ambiguous(
      ["Fuzzy similarity is a review suggestion and cannot create a canonical binding."],
      fuzzyTargets,
      prior?.externalIdentityId ?? null,
      "fuzzy_suggestion",
    );
  }

  return {
    decision: "unmatched",
    matchState: "unmatched",
    matchMethod: null,
    confidence: 0,
    target: null,
    externalIdentityId: prior?.externalIdentityId ?? null,
    candidateTargets: [],
    reasons: ["No deterministic reviewed identity evidence matched."],
  };
}
