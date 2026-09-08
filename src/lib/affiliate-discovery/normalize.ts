import { safeReviewUrl } from "../security/review-url";

import type { AffiliateProgramCandidate } from "./types";

export function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeHttpUrl(value: string | null | undefined): string | null {
  const safe = safeReviewUrl(value?.trim() || null);
  if (!safe) return null;

  const url = new URL(safe);
  url.hash = "";
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}

export function normalizeDomain(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const normalizedUrl = normalizeHttpUrl(
    /^https:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
  );
  if (!normalizedUrl) return null;

  return new URL(normalizedUrl).hostname.toLocaleLowerCase("en").replace(/^www\./, "");
}

export type CandidateFingerprintBasis =
  | "external-program-id"
  | "program-url"
  | "domain"
  | "names";

export interface CandidateFingerprint {
  value: string;
  basis: CandidateFingerprintBasis;
}

function normalizeExternalId(value: string | null): string {
  return value?.trim() ?? "";
}

export function createCandidateFingerprint(
  candidate: AffiliateProgramCandidate,
): CandidateFingerprint | null {
  const network = normalizeName(candidate.network);
  if (!network) return null;

  const externalProgramId = normalizeExternalId(candidate.externalProgramId);
  if (externalProgramId) {
    return {
      value: `${network}|external-program-id:${externalProgramId}`,
      basis: "external-program-id",
    };
  }

  const programUrl = normalizeHttpUrl(candidate.programUrl);
  if (programUrl) {
    return { value: `${network}|program-url:${programUrl}`, basis: "program-url" };
  }

  const domains = [
    ...new Set(
      candidate.domains
        .map(normalizeDomain)
        .filter((domain): domain is string => domain !== null),
    ),
  ].sort();
  if (domains.length > 0) {
    return { value: `${network}|domain:${domains.join(",")}`, basis: "domain" };
  }

  const names = {
    "product-name": normalizeName(candidate.productName),
    "program-name": normalizeName(candidate.programName),
    "vendor-name": normalizeName(candidate.vendorName),
  };
  if (Object.values(names).every((value) => !value)) return null;

  const canonicalNames = Object.entries(names)
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([field, value]) => `${field}:${value}`)
    .join("|");

  return { value: `${network}|names:${canonicalNames}`, basis: "names" };
}

export interface AffiliateCandidateDuplicate {
  fingerprint: string;
  basis: CandidateFingerprintBasis;
  candidateIndexes: number[];
  evidence: string;
}

export function findCandidateDuplicates(
  candidates: readonly AffiliateProgramCandidate[],
): AffiliateCandidateDuplicate[] {
  const groups = new Map<
    string,
    { basis: CandidateFingerprintBasis; candidateIndexes: number[] }
  >();

  candidates.forEach((candidate, index) => {
    const fingerprint = createCandidateFingerprint(candidate);
    if (!fingerprint) return;
    const existing = groups.get(fingerprint.value);
    if (existing) {
      existing.candidateIndexes.push(index);
    } else {
      groups.set(fingerprint.value, {
        basis: fingerprint.basis,
        candidateIndexes: [index],
      });
    }
  });

  return [...groups.entries()]
    .filter(([, group]) => group.candidateIndexes.length > 1)
    .map(([fingerprint, group]) => ({
      fingerprint,
      basis: group.basis,
      candidateIndexes: group.candidateIndexes,
      evidence: `Candidates share the same ${group.basis} fingerprint.`,
    }));
}
