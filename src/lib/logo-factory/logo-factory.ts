import { createHash } from "node:crypto";
import { isIP } from "node:net";

export const LOGO_FACTORY_VERSION = 1;

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MIN_DIMENSION = 32;
const MAX_DIMENSION = 4096;
const MAX_ASPECT_RATIO = 12;
const MAX_CANDIDATES_PER_PRODUCT = 10;

const REJECTED_ASSET_TERMS = [
  "advert",
  "award",
  "badge",
  "banner",
  "certification",
  "client",
  "customer",
  "facebook",
  "featured",
  "hero",
  "instagram",
  "illustration",
  "open-graph",
  "open_graph",
  "og-image",
  "og_image",
  "ogimage",
  "ogthumb",
  "opengraph",
  "overlay",
  "partner",
  "pixel",
  "promo",
  "review",
  "screenshot",
  "salesforce",
  "seo",
  "social",
  "social-share",
  "testimonial",
  "tracking",
  "trustpilot",
  "youtube",
];

const GENERIC_IDENTITY_TERMS = new Set([
  "app",
  "cloud",
  "company",
  "global",
  "inc",
  "india",
  "labs",
  "online",
  "platform",
  "software",
  "solutions",
  "technologies",
  "technology",
  "tool",
]);

export type LogoSourceKind = "product" | "vendor" | "favicon";
export type LogoCandidateKind =
  | "structured_logo"
  | "logo_image"
  | "manifest_icon"
  | "apple_touch_icon"
  | "favicon";

export interface LogoFactoryProduct {
  id: string;
  slug: string;
  name: string;
  websiteUrl: string;
  vendor: {
    id: string | null;
    name: string;
    slug: string | null;
    websiteUrl: string | null;
  };
}

export interface LogoCandidate {
  url: string;
  kind: LogoCandidateKind;
  score: number;
  evidence: string;
}

export interface LogoDiscovery {
  candidates: LogoCandidate[];
  manifestUrls: string[];
}

export interface ValidatedImage {
  extension: "ico" | "jpg" | "png" | "webp";
  mimeType: string;
  width: number;
  height: number;
  sha256: string;
}

export interface SuccessfulLogoAcquisition {
  status: "success";
  product: LogoFactoryProduct;
  sourceKind: LogoSourceKind;
  sourceUrl: string;
  pageUrl: string;
  image: ValidatedImage;
  bytes: Uint8Array;
}

export interface FallbackLogoAcquisition {
  status: "fallback";
  product: LogoFactoryProduct;
  reason:
    | "ambiguous_identity"
    | "blocked"
    | "http_failure"
    | "invalid_assets"
    | "no_candidates"
    | "unsafe_url";
  detail: string;
  pageHttpStatus: number | null;
  invalidCandidates: number;
}

export type LogoAcquisition = SuccessfulLogoAcquisition | FallbackLogoAcquisition;

export interface FetchResponse {
  status: number;
  url: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface LogoFactoryServices {
  fetch(url: string, maximumBytes: number): Promise<FetchResponse>;
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function normalizeIdentity(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
}

function identityTerms(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3 && !GENERIC_IDENTITY_TERMS.has(term));
}

function hostnameWithoutWww(url: string): string {
  return new URL(url).hostname.toLocaleLowerCase().replace(/^www\./, "");
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 0
  );
}

export function isSafePublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname) return false;
    const hostname = url.hostname.toLocaleLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".local")) return false;
    if (isIP(hostname) === 4) return !isPrivateIpv4(hostname);
    if (isIP(hostname) === 6) {
      return hostname !== "::1" && !hostname.startsWith("fc") && !hostname.startsWith("fd");
    }
    return true;
  } catch {
    return false;
  }
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    result[match[1].toLocaleLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

function resolveAssetUrl(value: string | undefined, pageUrl: string): string | null {
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) return null;
  try {
    const resolved = new URL(value, pageUrl);
    resolved.hash = "";
    return isSafePublicUrl(resolved.href) ? resolved.href : null;
  } catch {
    return null;
  }
}

function containsRejectedTerm(value: string): boolean {
  const normalized = value.toLocaleLowerCase();
  return REJECTED_ASSET_TERMS.some((term) => normalized.includes(term));
}

function candidateEvidence(attrs: Record<string, string>): string {
  return [attrs.alt, attrs.title, attrs.class, attrs.id, attrs.itemprop]
    .filter(Boolean)
    .join(" ")
    .slice(0, 240);
}

function assetIdentityText(url: string, evidence: string): string {
  const parsed = new URL(url);
  const fileName = decodeURIComponent(parsed.pathname.split("/").pop() ?? "");
  return `${fileName} ${evidence}`.toLocaleLowerCase();
}

function hasIdentitySignal(url: string, evidence: string, identity: string): boolean {
  const searchable = assetIdentityText(url, evidence);
  const normalizedIdentity = normalizeIdentity(identity);
  if (
    normalizedIdentity.length >= 4 &&
    normalizeIdentity(searchable).includes(normalizedIdentity)
  ) {
    return true;
  }
  const terms = identityTerms(identity);
  return terms.length === 1 && searchable.includes(terms[0]);
}

function hasFileNameIdentitySignal(url: string, identity: string): boolean {
  return hasIdentitySignal(url, "", identity);
}

function hasEvidenceIdentitySignal(evidence: string, identity: string): boolean {
  const normalizedIdentity = normalizeIdentity(identity);
  const normalizedEvidence = normalizeIdentity(evidence);
  if (normalizedIdentity.length >= 4 && normalizedEvidence.includes(normalizedIdentity))
    return true;
  const terms = identityTerms(identity);
  return terms.length === 1 && evidence.toLocaleLowerCase().includes(terms[0]);
}

function addCandidate(
  candidates: Map<string, LogoCandidate>,
  candidate: LogoCandidate | null,
): void {
  if (!candidate || containsRejectedTerm(`${candidate.url} ${candidate.evidence}`)) return;
  const current = candidates.get(candidate.url);
  if (!current || candidate.score > current.score) candidates.set(candidate.url, candidate);
}

function jsonLdLogoUrl(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  return typeof object.url === "string"
    ? object.url
    : typeof object.contentUrl === "string"
      ? object.contentUrl
      : null;
}

function structuredLogoCandidates(html: string, pageUrl: string): LogoCandidate[] {
  const candidates: LogoCandidate[] = [];
  const allowedTypes = new Set([
    "brand",
    "organization",
    "product",
    "softwareapplication",
    "website",
  ]);
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    const rawType = object["@type"];
    const types = (Array.isArray(rawType) ? rawType : [rawType])
      .filter((type): type is string => typeof type === "string")
      .map((type) => type.toLocaleLowerCase());
    if (types.some((type) => allowedTypes.has(type))) {
      const logo = resolveAssetUrl(jsonLdLogoUrl(object.logo) ?? undefined, pageUrl);
      if (logo) {
        candidates.push({
          url: logo,
          kind: "structured_logo",
          score: 98,
          evidence: `structured ${types.join(",")} ${typeof object.name === "string" ? object.name : ""} logo`,
        });
      }
    }
    if (Array.isArray(object["@graph"])) visit(object["@graph"]);
  };

  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json')[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      visit(JSON.parse(decodeHtml(match[1])) as unknown);
    } catch {
      // Invalid structured data cannot be trusted as logo evidence.
    }
  }
  return candidates;
}

export function discoverLogoCandidates(
  html: string,
  pageUrl: string,
  product: LogoFactoryProduct,
): LogoDiscovery {
  const candidates = new Map<string, LogoCandidate>();
  const manifestUrls = new Set<string>();
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attrs = attributes(tag);
    const rel = attrs.rel?.toLocaleLowerCase() ?? "";
    const href = resolveAssetUrl(attrs.href, pageUrl);
    if (!href) continue;
    if (rel.split(/\s+/).includes("manifest")) {
      manifestUrls.add(href);
      continue;
    }
    if (rel.includes("apple-touch-icon")) {
      addCandidate(candidates, {
        url: href,
        kind: "apple_touch_icon",
        score: 68,
        evidence: `link rel="${rel}"`,
      });
    } else if (rel.includes("icon")) {
      const sizes = attrs.sizes ?? "";
      const sizeBonus = /\b(?:128|144|152|180|192|256|512)x/i.test(sizes) ? 8 : 0;
      addCandidate(candidates, {
        url: href,
        kind: "favicon",
        score: 52 + sizeBonus,
        evidence: `link rel="${rel}" sizes="${sizes}"`,
      });
    }
  }

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = attributes(tag);
    const key = `${attrs.property ?? ""} ${attrs.name ?? ""} ${attrs.itemprop ?? ""}`.toLowerCase();
    if (!key.includes("logo")) continue;
    const url = resolveAssetUrl(attrs.content, pageUrl);
    addCandidate(
      candidates,
      url
        ? {
            url,
            kind: "structured_logo",
            score: 100,
            evidence: `meta ${key.trim()}`,
          }
        : null,
    );
  }

  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const attrs = attributes(tag);
    const src = resolveAssetUrl(attrs.src ?? attrs["data-src"] ?? attrs["data-lazy-src"], pageUrl);
    if (!src) continue;
    const evidence = candidateEvidence(attrs);
    const fileIdentitySignal =
      hasFileNameIdentitySignal(src, product.name) ||
      hasFileNameIdentitySignal(src, product.vendor.name);
    const evidenceIdentitySignal =
      hasEvidenceIdentitySignal(evidence, product.name) ||
      hasEvidenceIdentitySignal(evidence, product.vendor.name);
    const structuralEvidence = [attrs.class, attrs.id, attrs.itemprop, attrs.role]
      .filter(Boolean)
      .join(" ");
    const strongStructuralLogo =
      /\b(?:(?:site|header|nav|navbar|main|primary|footer|brand)[-_ ]*(?:logo|brand)|custom[-_ ]*logo|(?:logo|brand)[-_ ]*(?:site|header|nav|navbar|main|primary|footer))\b/i.test(
        structuralEvidence,
      );
    const fileIdentityLogo =
      fileIdentitySignal &&
      /\b(brand|logo|logotype|wordmark)\b/i.test(
        `${structuralEvidence} ${attrs.alt ?? ""} ${decodeURIComponent(new URL(src).pathname.split("/").pop() ?? "")}`,
      );
    const structuralIdentityLogo = strongStructuralLogo && evidenceIdentitySignal;
    if (!fileIdentityLogo && !structuralIdentityLogo) continue;
    addCandidate(candidates, {
      url: src,
      kind: "logo_image",
      score: fileIdentityLogo ? 94 : 86,
      evidence,
    });
  }

  for (const candidate of structuredLogoCandidates(html, pageUrl)) {
    addCandidate(candidates, candidate);
  }

  return {
    candidates: [...candidates.values()].sort(
      (left, right) => right.score - left.score || left.url.localeCompare(right.url),
    ),
    manifestUrls: [...manifestUrls].sort(),
  };
}

export function discoverManifestCandidates(
  manifest: unknown,
  manifestUrl: string,
): LogoCandidate[] {
  if (!manifest || typeof manifest !== "object") return [];
  const icons = (manifest as { icons?: unknown }).icons;
  if (!Array.isArray(icons)) return [];
  const candidates: LogoCandidate[] = [];
  for (const icon of icons) {
    if (!icon || typeof icon !== "object") continue;
    const entry = icon as { src?: unknown; sizes?: unknown; purpose?: unknown };
    if (typeof entry.src !== "string") continue;
    const url = resolveAssetUrl(entry.src, manifestUrl);
    if (!url) continue;
    const sizes = typeof entry.sizes === "string" ? entry.sizes : "";
    const purpose = typeof entry.purpose === "string" ? entry.purpose : "";
    const sizeBonus = /\b(?:128|144|152|180|192|256|384|512)x/i.test(sizes) ? 12 : 0;
    candidates.push({
      url,
      kind: "manifest_icon",
      score: 64 + sizeBonus,
      evidence: `manifest icon sizes="${sizes}" purpose="${purpose}"`,
    });
  }
  return candidates.sort(
    (left, right) => right.score - left.score || left.url.localeCompare(right.url),
  );
}

function candidateHasProductSignal(candidate: LogoCandidate, product: LogoFactoryProduct): boolean {
  return hasIdentitySignal(candidate.url, candidate.evidence, product.name);
}

export function classifyCandidate(
  candidate: LogoCandidate,
  product: LogoFactoryProduct,
): LogoSourceKind | null {
  const sameIdentity =
    normalizeIdentity(product.name) === normalizeIdentity(product.vendor.name) ||
    normalizeIdentity(product.slug) === normalizeIdentity(product.vendor.slug ?? "");
  const productHost = hostnameWithoutWww(product.websiteUrl);
  const vendorHost = product.vendor.websiteUrl
    ? hostnameWithoutWww(product.vendor.websiteUrl)
    : productHost;
  const distinctProductHost = productHost !== vendorHost;

  if (
    candidate.kind === "favicon" ||
    candidate.kind === "apple_touch_icon" ||
    candidate.kind === "manifest_icon"
  ) {
    return candidateHasProductSignal(candidate, product) || sameIdentity || distinctProductHost
      ? "favicon"
      : null;
  }
  if (candidateHasProductSignal(candidate, product)) return "product";
  if (candidate.kind === "structured_logo" && sameIdentity) return "vendor";
  if (candidate.kind === "structured_logo" && distinctProductHost) return "product";
  return null;
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + length + 2 > bytes.length) return null;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
      };
    }
    offset += length + 2;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const text = (start: number, length: number) =>
    String.fromCharCode(...bytes.subarray(start, start + length));
  if (bytes.length < 30 || text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP") return null;
  const chunk = text(12, 4);
  if (chunk === "VP8X") {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    return {
      width: 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]),
      height: 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | (bytes[22] >> 6)),
    };
  }
  if (chunk === "VP8 " && bytes.length >= 30) {
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    };
  }
  return null;
}

function icoDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 22 || bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 1 || bytes[3] !== 0) {
    return null;
  }
  const count = bytes[4] | (bytes[5] << 8);
  if (count < 1 || bytes.length < 6 + count * 16) return null;
  let width = 0;
  let height = 0;
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    width = Math.max(width, bytes[offset] || 256);
    height = Math.max(height, bytes[offset + 1] || 256);
  }
  return { width, height };
}

export function validateImage(bytes: Uint8Array, contentType: string): ValidatedImage | null {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
  const normalizedMime = contentType.split(";")[0].trim().toLocaleLowerCase();
  let extension: ValidatedImage["extension"] | null = null;
  let dimensions: { width: number; height: number } | null = null;

  if ((normalizedMime === "image/png" || !normalizedMime) && (dimensions = pngDimensions(bytes))) {
    extension = "png";
  } else if (
    (normalizedMime === "image/jpeg" || normalizedMime === "image/jpg" || !normalizedMime) &&
    (dimensions = jpegDimensions(bytes))
  ) {
    extension = "jpg";
  } else if (
    (normalizedMime === "image/webp" || !normalizedMime) &&
    (dimensions = webpDimensions(bytes))
  ) {
    extension = "webp";
  } else if (
    (normalizedMime === "image/x-icon" ||
      normalizedMime === "image/vnd.microsoft.icon" ||
      normalizedMime === "application/octet-stream" ||
      !normalizedMime) &&
    (dimensions = icoDimensions(bytes))
  ) {
    extension = "ico";
  }

  if (!extension || !dimensions) return null;
  if (
    dimensions.width < MIN_DIMENSION ||
    dimensions.height < MIN_DIMENSION ||
    dimensions.width > MAX_DIMENSION ||
    dimensions.height > MAX_DIMENSION ||
    Math.max(dimensions.width / dimensions.height, dimensions.height / dimensions.width) >
      MAX_ASPECT_RATIO
  ) {
    return null;
  }

  return {
    extension,
    mimeType:
      extension === "ico"
        ? "image/x-icon"
        : extension === "jpg"
          ? "image/jpeg"
          : `image/${extension}`,
    width: dimensions.width,
    height: dimensions.height,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function mergeCandidates(...groups: readonly LogoCandidate[][]): LogoCandidate[] {
  const candidates = new Map<string, LogoCandidate>();
  for (const group of groups) {
    for (const candidate of group) addCandidate(candidates, candidate);
  }
  return [...candidates.values()].sort(
    (left, right) => right.score - left.score || left.url.localeCompare(right.url),
  );
}

function responseText(response: FetchResponse): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(response.bytes);
}

export async function acquireProductLogo(
  product: LogoFactoryProduct,
  services: LogoFactoryServices,
): Promise<LogoAcquisition> {
  if (!isSafePublicUrl(product.websiteUrl)) {
    return {
      status: "fallback",
      product,
      reason: "unsafe_url",
      detail: "Official website is not a safe public HTTPS URL.",
      pageHttpStatus: null,
      invalidCandidates: 0,
    };
  }

  let page: FetchResponse;
  try {
    page = await services.fetch(product.websiteUrl, MAX_HTML_BYTES);
  } catch (error) {
    return {
      status: "fallback",
      product,
      reason: "http_failure",
      detail: error instanceof Error ? error.message : "Official page request failed.",
      pageHttpStatus: null,
      invalidCandidates: 0,
    };
  }
  if (page.status !== 200) {
    return {
      status: "fallback",
      product,
      reason: page.status === 403 || page.status === 429 ? "blocked" : "http_failure",
      detail: `Official page returned HTTP ${page.status}.`,
      pageHttpStatus: page.status,
      invalidCandidates: 0,
    };
  }
  if (!page.contentType.toLocaleLowerCase().includes("text/html")) {
    return {
      status: "fallback",
      product,
      reason: "http_failure",
      detail: `Official page returned ${page.contentType || "an unknown content type"}.`,
      pageHttpStatus: page.status,
      invalidCandidates: 0,
    };
  }

  const discovery = discoverLogoCandidates(responseText(page), page.url, product);
  const manifestCandidates: LogoCandidate[] = [];
  for (const manifestUrl of discovery.manifestUrls.slice(0, 2)) {
    try {
      const manifestResponse = await services.fetch(manifestUrl, 256 * 1024);
      if (manifestResponse.status !== 200) continue;
      const manifest = JSON.parse(responseText(manifestResponse)) as unknown;
      manifestCandidates.push(...discoverManifestCandidates(manifest, manifestResponse.url));
    } catch {
      // A malformed or unavailable optional manifest must not hide direct official candidates.
    }
  }

  const discovered = mergeCandidates(discovery.candidates, manifestCandidates);
  if (discovered.length === 0) {
    return {
      status: "fallback",
      product,
      reason: "no_candidates",
      detail: "No first-party logo candidates were declared by the official page.",
      pageHttpStatus: page.status,
      invalidCandidates: 0,
    };
  }
  const classified = discovered
    .map((candidate) => ({ candidate, sourceKind: classifyCandidate(candidate, product) }))
    .filter(
      (
        entry,
      ): entry is {
        candidate: LogoCandidate;
        sourceKind: LogoSourceKind;
      } => entry.sourceKind !== null,
    );
  if (classified.length === 0) {
    return {
      status: "fallback",
      product,
      reason: "ambiguous_identity",
      detail: "Declared assets did not safely identify this product rather than a sibling vendor.",
      pageHttpStatus: page.status,
      invalidCandidates: 0,
    };
  }

  let invalidCandidates = 0;
  for (const { candidate, sourceKind } of classified.slice(0, MAX_CANDIDATES_PER_PRODUCT)) {
    try {
      const response = await services.fetch(candidate.url, MAX_IMAGE_BYTES);
      if (response.status !== 200) {
        invalidCandidates += 1;
        continue;
      }
      const image = validateImage(response.bytes, response.contentType);
      if (!image) {
        invalidCandidates += 1;
        continue;
      }
      return {
        status: "success",
        product,
        sourceKind,
        sourceUrl: response.url,
        pageUrl: page.url,
        image,
        bytes: response.bytes,
      };
    } catch {
      invalidCandidates += 1;
    }
  }

  return {
    status: "fallback",
    product,
    reason: "invalid_assets",
    detail: "All identity-safe candidates failed image validation or acquisition.",
    pageHttpStatus: page.status,
    invalidCandidates,
  };
}

export function rejectSharedAssetCollisions(
  acquisitions: readonly LogoAcquisition[],
): LogoAcquisition[] {
  const productsByHash = new Map<string, Set<string>>();
  for (const acquisition of acquisitions) {
    if (acquisition.status !== "success") continue;
    const products = productsByHash.get(acquisition.image.sha256) ?? new Set<string>();
    products.add(acquisition.product.id);
    productsByHash.set(acquisition.image.sha256, products);
  }

  return acquisitions.map((acquisition) => {
    if (
      acquisition.status === "fallback" ||
      (productsByHash.get(acquisition.image.sha256)?.size ?? 0) < 2
    ) {
      return acquisition;
    }
    return {
      status: "fallback",
      product: acquisition.product,
      reason: "ambiguous_identity",
      detail: "The same byte-identical asset was selected for multiple canonical products.",
      pageHttpStatus: 200,
      invalidCandidates: 0,
    };
  });
}

export async function mapWithConcurrency<Input, Output>(
  inputs: readonly Input[],
  concurrency: number,
  operation: (input: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Concurrency must be a positive integer.");
  }
  const outputs = new Array<Output>(inputs.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= inputs.length) return;
      outputs[index] = await operation(inputs[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, () => worker()));
  return outputs;
}
