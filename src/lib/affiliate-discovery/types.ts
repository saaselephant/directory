export const KNOWN_AFFILIATE_NETWORKS = [
  "partnerstack",
  "awin",
  "cj",
  "impact",
] as const;

export type KnownAffiliateNetwork = (typeof KNOWN_AFFILIATE_NETWORKS)[number];
export type AffiliateNetwork = KnownAffiliateNetwork | (string & Record<never, never>);

export type AffiliateProviderRelationship =
  | "unknown"
  | "available"
  | "applied"
  | "approved"
  | "rejected";

export type AffiliateCandidateReviewStatus =
  | "unreviewed"
  | "unmatched"
  | "ambiguous"
  | "ready_for_review"
  | "accepted_for_import"
  | "rejected"
  | "deferred"
  | "imported_pending";

export interface AffiliateCandidateIssue {
  code: string;
  severity: "warning" | "error";
  message: string;
  field?: string;
}

export interface AffiliateSoftwareMatch {
  softwareId: string | null;
  slug: string | null;
  confidence: number;
  decision: "suggested" | "ambiguous" | "confirmed";
  reasons: string[];
}

export interface AffiliateProgramCandidate {
  network: AffiliateNetwork;
  externalProgramId: string | null;
  externalAdvertiserId: string | null;
  programName: string;
  vendorName: string | null;
  productName: string | null;
  softwareSlugHint: string | null;
  programUrl: string | null;
  applicationUrl: string | null;
  destinationUrl: string | null;
  domains: string[];
  commission: {
    type: string | null;
    value: string | null;
    recurring: string | null;
    cookieDuration: string | null;
    terms: Readonly<Record<string, unknown>>;
  };
  providerRelationship: AffiliateProviderRelationship;
  source: {
    kind: "export" | "api";
    reference: string | null;
    observedAt: string | null;
  };
  match: AffiliateSoftwareMatch | null;
  reviewStatus: AffiliateCandidateReviewStatus;
  issues: AffiliateCandidateIssue[];
}

export interface AffiliateNetworkAdapter<RawRecord> {
  readonly network: AffiliateNetwork;
  normalize(record: RawRecord): AffiliateProgramCandidate;
}
