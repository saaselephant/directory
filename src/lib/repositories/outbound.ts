import "server-only";
import { getPublicSupabaseConfig } from "@/lib/config/env";
import { getPublishedSoftwareBySlug } from "@/lib/repositories/software";
import { safeReviewUrl } from "@/lib/security/review-url";
import type { Database } from "@/types/database";

export function validOutboundSlug(slug: string) {
  return slug.length <= 200 && /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

/** Only used during navigation, never in public page data or metadata. */
export async function resolveSoftwareOutbound(slug: string): Promise<string | null> {
  if (!validOutboundSlug(slug)) return null;
  // Existing published-only repository supplies a safe fallback even before migration.
  let software;
  try {
    software = await getPublishedSoftwareBySlug(slug);
  } catch {
    return null;
  }
  if (software.status !== "success") return null;
  const fallback = safeReviewUrl(software.item.websiteUrl);
  try {
    const { url, publishableKey } = getPublicSupabaseConfig();
    const args: Database["public"]["Functions"]["saaselephant_software_outbound"]["Args"] = {
      p_software_slug: slug,
    };
    const response = await fetch(new URL("/rest/v1/rpc/saaselephant_software_outbound", url), {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    // A concurrent unpublish or explicit DB denial must not fall back to a stale read.
    if (response.status === 404) {
      // PostgREST's missing-function response has PGRST202; during rollout keep
      // non-affiliate products usable. The function's own 404 returns no object.
      const body: unknown = await response.json().catch(() => null);
      if (typeof body === "object" && body !== null && "code" in body && body.code === "PGRST202") {
        return fallback;
      }
      return null;
    }
    if (response.status === 401 || response.status === 403) return null;
    if (response.status === 303) return safeReviewUrl(response.headers.get("Location")) ?? fallback;
    return fallback;
  } catch {
    return fallback;
  }
}
