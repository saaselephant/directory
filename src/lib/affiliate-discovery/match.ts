import { normalizeDomain, normalizeName } from "./normalize";
import type {
  AffiliateNetwork,
  AffiliateProgramCandidate,
  AffiliateSoftwareMatch,
} from "./types";

export interface AffiliateSoftwareInventoryItem {
  id: string;
  slug: string;
  name: string;
  vendorName: string | null;
  websiteUrl: string | null;
}

export interface ReviewedAffiliateBinding {
  network: AffiliateNetwork;
  externalProgramId: string;
  softwareId: string;
  softwareSlug?: string;
}

interface MatchTier {
  confidence: number;
  reason: string;
  items: AffiliateSoftwareInventoryItem[];
}

function resultForTier(tier: MatchTier): AffiliateSoftwareMatch | null {
  if (tier.items.length === 0) return null;
  const [item] = tier.items;
  if (tier.items.length > 1) {
    return {
      softwareId: null,
      slug: null,
      confidence: tier.confidence,
      decision: "ambiguous",
      reasons: [
        tier.reason,
        `Multiple software records matched: ${tier.items.map(({ slug }) => slug).join(", ")}.`,
      ],
    };
  }

  return {
    softwareId: item.id,
    slug: item.slug,
    confidence: tier.confidence,
    decision: "suggested",
    reasons: [tier.reason],
  };
}

export function matchAffiliateCandidate(
  candidate: AffiliateProgramCandidate,
  inventory: readonly AffiliateSoftwareInventoryItem[],
  reviewedBindings: readonly ReviewedAffiliateBinding[] = [],
): AffiliateSoftwareMatch | null {
  const network = normalizeName(candidate.network);
  const externalProgramId = candidate.externalProgramId?.trim() ?? "";

  if (externalProgramId) {
    const bindings = reviewedBindings.filter(
      (item) =>
        normalizeName(item.network) === network &&
        item.externalProgramId.trim() === externalProgramId,
    );
    if (bindings.length > 0) {
      const resolvedSoftware = new Map<string, AffiliateSoftwareInventoryItem>();
      const conflicts: string[] = [];

      for (const binding of bindings) {
        const softwareId = binding.softwareId.trim();
        const softwareById = inventory.find(({ id }) => id === softwareId);
        if (!softwareById) {
          conflicts.push(`Reviewed software ID "${softwareId}" was not found in the inventory.`);
          continue;
        }

        if (binding.softwareSlug !== undefined) {
          const reviewedSlug = binding.softwareSlug.trim().toLocaleLowerCase("en");
          const softwareBySlug = inventory.filter(
            ({ slug }) => slug.toLocaleLowerCase("en") === reviewedSlug,
          );
          if (softwareBySlug.length !== 1) {
            conflicts.push(
              `Reviewed software slug "${binding.softwareSlug}" did not resolve uniquely.`,
            );
            continue;
          }
          if (softwareBySlug[0].id !== softwareById.id) {
            conflicts.push(
              `Reviewed software ID "${softwareId}" conflicts with reviewed slug "${binding.softwareSlug}".`,
            );
            continue;
          }
        }

        resolvedSoftware.set(softwareById.id, softwareById);
      }

      if (resolvedSoftware.size > 1) {
        conflicts.push(
          `Reviewed bindings point to multiple software records: ${[
            ...resolvedSoftware.values(),
          ]
            .map(({ slug }) => slug)
            .join(", ")}.`,
        );
      }

      if (conflicts.length > 0 || resolvedSoftware.size !== 1) {
        return {
          softwareId: null,
          slug: null,
          confidence: 0,
          decision: "ambiguous",
          reasons: [
            "Reviewed network and external-program binding evidence is conflicting or unresolved.",
            ...conflicts,
          ],
        };
      }

      const [software] = resolvedSoftware.values();
      return {
        softwareId: software.id,
        slug: software.slug,
        confidence: 100,
        decision: "confirmed",
        reasons: ["Matched a unique and consistent reviewed network and external-program binding."],
      };
    }
  }

  const candidateDomains = new Set(
    candidate.domains.map(normalizeDomain).filter((domain): domain is string => Boolean(domain)),
  );
  const domainMatch = resultForTier({
    confidence: 95,
    reason: "Matched the exact normalized official domain.",
    items: inventory.filter((item) => {
      const domain = normalizeDomain(item.websiteUrl);
      return domain !== null && candidateDomains.has(domain);
    }),
  });
  if (domainMatch) return domainMatch;

  const slugHint = normalizeName(candidate.softwareSlugHint).replace(/\s+/g, "-");
  if (slugHint) {
    const slugMatch = resultForTier({
      confidence: 90,
      reason: "Matched the exact supplied software slug.",
      items: inventory.filter(({ slug }) => slug.toLocaleLowerCase("en") === slugHint),
    });
    if (slugMatch) return slugMatch;
  }

  const productName = normalizeName(candidate.productName);
  if (productName) {
    const nameMatch = resultForTier({
      confidence: 85,
      reason: "Matched the exact normalized product name.",
      items: inventory.filter(({ name }) => normalizeName(name) === productName),
    });
    if (nameMatch) return nameMatch;
  }

  const vendorName = normalizeName(candidate.vendorName);
  const programName = normalizeName(candidate.programName);
  if (vendorName && programName.includes(vendorName)) {
    return resultForTier({
      confidence: 70,
      reason: "Matched the exact vendor name with supporting program-name evidence.",
      items: inventory.filter((item) => normalizeName(item.vendorName) === vendorName),
    });
  }

  return null;
}
