import { normalizeDomain, normalizeHttpUrl, normalizeName } from "./normalize";
import type { AffiliateNetworkAdapter, AffiliateProgramCandidate } from "./types";

/** Local capture contract, not a claim about PartnerStack's authenticated API schema. */
export interface PartnerStackMarketplaceRecord {
  name: string;
  programId?: string | number;
  companyId?: string | number;
  vendorName?: string;
  productName?: string;
  softwareSlugHint?: string;
  description?: string;
  programUrl?: string;
  applicationUrl?: string;
  destinationUrl?: string;
  domains?: string[];
  commission?: {
    text?: string;
    model?: string;
    value?: string;
    recurring?: string;
    cookieDuration?: string;
    metadata?: Record<string, unknown>;
  };
  partnerTypes?: string[];
  supportsSubIds?: boolean;
  relationship?: string;
  source?: Partial<AffiliateProgramCandidate["source"]>;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const models: Record<
  string,
  NonNullable<AffiliateProgramCandidate["commercial"]>["commissionModel"]
> = {
  "revenue share": "revenue_share",
  "revenue sharing": "revenue_share",
  cpl: "cpl",
  "cost per lead": "cpl",
  cpa: "cpa",
  "cost per acquisition": "cpa",
  "cost per action": "cpa",
  cpc: "cpc",
  "cost per click": "cpc",
};

/** Only explicit model labels are parsed; percentages/prose do not establish a model. */
export function createPartnerStackAdapter(
  source: AffiliateProgramCandidate["source"] = {
    kind: "export",
    reference: null,
    observedAt: null,
  },
): AffiliateNetworkAdapter<unknown> {
  return {
    network: "partnerstack",
    normalize(input) {
      const issues: AffiliateProgramCandidate["issues"] = [];
      const issue = (field: string, message: string, code = "invalid_field") => {
        issues.push({ code, severity: "error", field, message });
      };
      const record = object(input) ?? {};
      if (!object(input)) issue("record", "Program must be an object.");
      const text = (value: unknown, field: string): string | null => {
        if (value == null) return null;
        if (typeof value !== "string") {
          issue(field, "Expected a string.");
          return null;
        }
        return value.trim() || null;
      };
      const id = (value: unknown, field: string): string | null => {
        if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
          return String(value);
        return text(value, field);
      };
      const strings = (value: unknown, field: string): string[] => {
        if (value == null) return [];
        if (!Array.isArray(value)) {
          issue(field, "Expected an array of strings.");
          return [];
        }
        return [
          ...new Set(
            value
              .map((item) => {
                if (typeof item !== "string" || !item.trim()) {
                  issue(field, "Array entries must be nonempty strings.");
                  return null;
                }
                return item.trim();
              })
              .filter((item): item is string => item !== null),
          ),
        ];
      };
      const url = (value: unknown, field: string) => {
        const raw = text(value, field);
        const normalized = normalizeHttpUrl(raw);
        if (raw && !normalized) issue(field, "Expected a safe HTTPS URL.");
        return normalized;
      };
      const programName = text(record.name, "name") ?? "";
      if (!normalizeName(programName)) issue("name", "A program display name is required.");
      // Parse only explicit display-name constructions, preserving the original name.
      const renamed = programName.match(/^(.+?)\s+\(formerly\s+(.+?)\)$/i);
      const family = programName.match(/^(.+?)\s+by\s+(.+)$/i);
      const displayProduct = (renamed?.[1] ?? family?.[1] ?? programName).trim();
      const suppliedProduct = text(record.productName, "productName");
      const suppliedVendor = text(record.vendorName, "vendorName");
      if (
        (suppliedProduct && normalizeName(suppliedProduct) !== normalizeName(displayProduct)) ||
        (family && suppliedVendor && normalizeName(suppliedVendor) !== normalizeName(family[2]))
      ) {
        issues.push({
          code: "identity_conflict",
          severity: "warning",
          message: "Explicit product/vendor fields conflict with the marketplace display name.",
        });
      }
      const commission = object(record.commission) ?? {};
      if (record.commission != null && !object(record.commission))
        issue("commission", "Expected an object.");
      const commissionText = text(commission.text, "commission.text");
      const model = text(commission.model, "commission.model");
      const commissionModel = Object.hasOwn(models, normalizeName(model ?? commissionText))
        ? models[normalizeName(model ?? commissionText)]
        : "unknown";
      const metadata = object(commission.metadata);
      if (commission.metadata != null && !metadata)
        issue("commission.metadata", "Expected an object.");
      const relationshipText = text(record.relationship, "relationship");
      const relationships: Record<string, AffiliateProgramCandidate["providerRelationship"]> = {
        available: "available",
        "not applied": "available",
        applied: "applied",
        pending: "applied",
        approved: "approved",
        rejected: "rejected",
        unknown: "unknown",
      };
      let supportsSubIds: boolean | null = null;
      if (typeof record.supportsSubIds === "boolean") supportsSubIds = record.supportsSubIds;
      else if (record.supportsSubIds != null) issue("supportsSubIds", "Expected true or false.");
      const destinationUrl = url(record.destinationUrl, "destinationUrl");
      const domains = strings(record.domains, "domains").flatMap((raw) => {
        const domain = normalizeDomain(raw);
        if (!domain) {
          issue("domains", "Invalid domain.");
          return [];
        }
        return [domain];
      });
      const destinationDomain = normalizeDomain(destinationUrl);
      if (destinationDomain) domains.push(destinationDomain);
      const rawSource = object(record.source) ?? {};
      if (record.source != null && !object(record.source)) issue("source", "Expected an object.");
      const mergedSource = { ...source, ...rawSource };
      const kind = mergedSource.kind;
      if (kind !== "export" && kind !== "api") issue("source.kind", "Expected export or api.");
      const observedAt = text(mergedSource.observedAt, "source.observedAt");
      const validTimestamp =
        observedAt === null ||
        (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(observedAt) &&
          Number.isFinite(Date.parse(observedAt)));
      if (!validTimestamp) issue("source.observedAt", "Expected an ISO timestamp with a timezone.");
      return {
        network: "partnerstack",
        externalProgramId: id(record.programId, "programId"),
        externalAdvertiserId: id(record.companyId, "companyId"),
        programName,
        productName: suppliedProduct ?? (displayProduct || null),
        vendorName: suppliedVendor ?? family?.[2]?.trim() ?? null,
        description: text(record.description, "description"),
        softwareSlugHint: text(record.softwareSlugHint, "softwareSlugHint"),
        programUrl: url(record.programUrl, "programUrl"),
        applicationUrl: url(record.applicationUrl, "applicationUrl"),
        destinationUrl,
        domains: [...new Set(domains)].sort(),
        commission: {
          type: model,
          value: text(commission.value, "commission.value"),
          recurring: text(commission.recurring, "commission.recurring"),
          cookieDuration: text(commission.cookieDuration, "commission.cookieDuration"),
          terms: metadata ?? {},
        },
        commercial: {
          commissionText,
          commissionModel,
          partnerTypes: strings(record.partnerTypes, "partnerTypes"),
          supportsSubIds,
          relationshipText,
          formerNames: renamed ? [renamed[2].trim()] : [],
        },
        providerRelationship: Object.hasOwn(relationships, normalizeName(relationshipText))
          ? relationships[normalizeName(relationshipText)]
          : "unknown",
        source: {
          kind: kind === "api" ? "api" : "export",
          reference: text(mergedSource.reference, "source.reference"),
          observedAt: validTimestamp ? observedAt : null,
          provenance: text(mergedSource.provenance, "source.provenance"),
        },
        match: null,
        reviewStatus: "unreviewed",
        issues,
      };
    },
  };
}

export function parsePartnerStackMarketplace(input: unknown): AffiliateProgramCandidate[] {
  const envelope = object(input);
  if (!envelope || envelope.schemaVersion !== 1 || !Array.isArray(envelope.programs)) {
    throw new Error("Expected a capture object with schemaVersion: 1 and programs: [].");
  }
  if (envelope.source != null && !object(envelope.source))
    throw new Error("source must be an object.");
  // Envelope provenance is retained even on malformed rows.
  const adapter = createPartnerStackAdapter({
    kind: "export",
    reference: null,
    observedAt: null,
    ...object(envelope.source),
  });
  return envelope.programs.map((program) => adapter.normalize(program));
}
