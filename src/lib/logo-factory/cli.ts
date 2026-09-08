import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  acquireProductLogo,
  isSafePublicUrl,
  LOGO_FACTORY_VERSION,
  mapWithConcurrency,
  rejectSharedAssetCollisions,
  type FetchResponse,
  type LogoAcquisition,
  type LogoFactoryProduct,
  type LogoFactoryServices,
} from "./logo-factory";

interface CatalogRow {
  software_id: string;
  slug: string;
  software_name: string;
  website_url: string;
  vendor: string;
  vendor_id: string | null;
  vendors: {
    vendor_id: string;
    vendor_name: string;
    slug: string;
    website_url: string | null;
  } | null;
}

interface RuntimeManifest {
  version: number;
  logos: Record<string, { src: string; alt: string }>;
}

interface ProvenanceItem {
  slug: string;
  name: string;
  vendor: string;
  status: "fallback" | "success";
  sourceKind?: "favicon" | "product" | "vendor";
  sourceUrl?: string;
  pageUrl?: string;
  assetPath?: string;
  width?: number;
  height?: number;
  sha256?: string;
  reason?: string;
  detail?: string;
  pageHttpStatus?: number | null;
  invalidCandidates?: number;
}

interface FactoryReport {
  version: number;
  productsConsidered: number;
  successful: number;
  coveragePercent: number;
  productSpecific: number;
  vendorLogos: number;
  faviconDerived: number;
  fallbacks: number;
  ambiguous: number;
  blocked: number;
  httpFailures: number;
  invalidCandidates: number;
  http403: number;
  http429: number;
  assetBytes: number;
  items: ProvenanceItem[];
}

const root = path.resolve(process.env.SAASELEPHANT_ROOT ?? process.cwd());
const DEFAULT_OUTPUT_DIR = path.join(root, "public", "software-logos");
const DEFAULT_RUNTIME_MANIFEST = path.join(root, "src", "generated", "software-logo-manifest.json");
const DEFAULT_RESULT = path.join(root, "docs", "software-logo-factory-result.json");
const DEFAULT_REPORT = path.join(root, "docs", "software-logo-factory-report.md");
const DEFAULT_CACHE_DIR = path.join(os.tmpdir(), "saaselephant-logo-factory-cache-v1");
const USER_AGENT = "SaaSElephant-LogoFactory/1.0 (+https://saaselephant.com)";
const CACHE_TTL_MILLISECONDS = 6 * 60 * 60 * 1000;

function argumentValue(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? null) : null;
}

function positiveInteger(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1)
    throw new Error(`Invalid positive integer: ${value}`);
  return parsed;
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLocaleLowerCase();
  if (normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  const parts = normalized.split(".").map(Number);
  return (
    parts.length === 4 &&
    (parts[0] === 10 ||
      parts[0] === 127 ||
      parts[0] === 0 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168))
  );
}

async function assertPublicDns(url: string): Promise<void> {
  if (!isSafePublicUrl(url)) throw new Error("Unsafe non-public URL.");
  const hostname = new URL(url).hostname;
  const addresses = await lookup(hostname, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("URL resolves to a private or unavailable network address.");
  }
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function createFetchServices(
  timeoutMilliseconds: number,
  cacheDirectory: string,
): LogoFactoryServices {
  const cache = new Map<string, Promise<FetchResponse>>();
  fs.mkdirSync(cacheDirectory, { recursive: true });
  const cachePaths = (key: string) => ({
    metadata: path.join(cacheDirectory, `${key}.json`),
    body: path.join(cacheDirectory, `${key}.bin`),
  });
  const fetchOnce = async (url: string, maximumBytes: number): Promise<FetchResponse> => {
    const key = createHash("sha256").update(`${maximumBytes}:${url}`).digest("hex");
    const paths = cachePaths(key);
    if (fs.existsSync(paths.metadata)) {
      let metadata:
        | {
            cachedAt: number;
            error?: string;
            status?: number;
            url?: string;
            contentType?: string;
          }
        | undefined;
      try {
        metadata = JSON.parse(fs.readFileSync(paths.metadata, "utf8")) as {
          cachedAt: number;
          error?: string;
          status?: number;
          url?: string;
          contentType?: string;
        };
      } catch {
        metadata = undefined;
      }
      if (metadata && Date.now() - metadata.cachedAt <= CACHE_TTL_MILLISECONDS) {
        if (metadata.error) throw new Error(metadata.error);
        if (
          typeof metadata.status === "number" &&
          typeof metadata.url === "string" &&
          typeof metadata.contentType === "string" &&
          fs.existsSync(paths.body)
        ) {
          return {
            status: metadata.status,
            url: metadata.url,
            contentType: metadata.contentType,
            bytes: fs.readFileSync(paths.body),
          };
        }
      }
    }

    const writeError = (error: unknown) => {
      const message = error instanceof Error ? error.message : "Request failed.";
      fs.writeFileSync(
        paths.metadata,
        `${JSON.stringify({ cachedAt: Date.now(), error: message })}\n`,
      );
    };
    try {
      await assertPublicDns(url);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMilliseconds);
        try {
          let currentUrl = url;
          let response: Response | null = null;
          for (let redirect = 0; redirect <= 5; redirect += 1) {
            await assertPublicDns(currentUrl);
            response = await fetch(currentUrl, {
              redirect: "manual",
              signal: controller.signal,
              headers: {
                Accept:
                  "text/html,application/json,image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.2",
                "User-Agent": USER_AGENT,
              },
            });
            if (![301, 302, 303, 307, 308].includes(response.status)) break;
            const location = response.headers.get("location");
            if (!location || redirect === 5)
              throw new Error("Invalid or excessive redirect chain.");
            currentUrl = new URL(location, currentUrl).href;
            if (!isSafePublicUrl(currentUrl))
              throw new Error("Redirect resolved to an unsafe URL.");
          }
          if (!response) throw new Error("Request failed before receiving a response.");
          const declaredLength = Number(response.headers.get("content-length") ?? "0");
          if (declaredLength > maximumBytes) throw new Error("Response exceeds the allowed size.");
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length > maximumBytes) throw new Error("Response exceeds the allowed size.");
          const result = {
            status: response.status,
            url: currentUrl,
            contentType: response.headers.get("content-type") ?? "",
            bytes,
          };
          if (!retryableStatus(response.status) || attempt === 1) {
            fs.writeFileSync(paths.body, result.bytes);
            fs.writeFileSync(
              paths.metadata,
              `${JSON.stringify({
                cachedAt: Date.now(),
                status: result.status,
                url: result.url,
                contentType: result.contentType,
              })}\n`,
            );
            return result;
          }
        } finally {
          clearTimeout(timer);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      writeError(error);
      throw error;
    }
    throw new Error("Request failed.");
  };

  return {
    fetch(url, maximumBytes) {
      const key = `${maximumBytes}:${url}`;
      let request = cache.get(key);
      if (!request) {
        request = fetchOnce(url, maximumBytes);
        cache.set(key, request);
      }
      return request;
    },
  };
}

async function loadCatalog(): Promise<LogoFactoryProduct[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    throw new Error("Public Supabase configuration is required.");
  }
  const select =
    "software_id,slug,software_name,website_url,vendor,vendor_id,vendors(vendor_id,vendor_name,slug,website_url)";
  const endpoint = new URL("/rest/v1/software", supabaseUrl);
  endpoint.searchParams.set("select", select);
  endpoint.searchParams.set("publication_status", "eq.published");
  endpoint.searchParams.set("order", "software_name.asc");
  endpoint.searchParams.set("limit", "10000");
  const response = await fetch(endpoint, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      Prefer: "count=exact",
    },
  });
  if (!response.ok) throw new Error(`Catalog request failed with HTTP ${response.status}.`);
  const rows = (await response.json()) as CatalogRow[];
  return rows
    .map((row) => ({
      id: row.software_id,
      slug: row.slug,
      name: row.software_name,
      websiteUrl: row.website_url,
      vendor: {
        id: row.vendors?.vendor_id ?? row.vendor_id,
        name: row.vendors?.vendor_name ?? row.vendor,
        slug: row.vendors?.slug ?? null,
        websiteUrl: row.vendors?.website_url ?? null,
      },
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

function provenance(acquisition: LogoAcquisition, assetPath?: string): ProvenanceItem {
  if (acquisition.status === "fallback") {
    return {
      slug: acquisition.product.slug,
      name: acquisition.product.name,
      vendor: acquisition.product.vendor.name,
      status: "fallback",
      reason: acquisition.reason,
      detail: acquisition.detail,
      pageHttpStatus: acquisition.pageHttpStatus,
      invalidCandidates: acquisition.invalidCandidates,
    };
  }
  return {
    slug: acquisition.product.slug,
    name: acquisition.product.name,
    vendor: acquisition.product.vendor.name,
    status: "success",
    sourceKind: acquisition.sourceKind,
    sourceUrl: acquisition.sourceUrl,
    pageUrl: acquisition.pageUrl,
    assetPath,
    width: acquisition.image.width,
    height: acquisition.image.height,
    sha256: acquisition.image.sha256,
  };
}

function reportFor(items: ProvenanceItem[], assetBytes: number): FactoryReport {
  const successful = items.filter((item) => item.status === "success");
  const fallback = items.filter((item) => item.status === "fallback");
  return {
    version: LOGO_FACTORY_VERSION,
    productsConsidered: items.length,
    successful: successful.length,
    coveragePercent: Number(((successful.length / Math.max(1, items.length)) * 100).toFixed(1)),
    productSpecific: successful.filter((item) => item.sourceKind === "product").length,
    vendorLogos: successful.filter((item) => item.sourceKind === "vendor").length,
    faviconDerived: successful.filter((item) => item.sourceKind === "favicon").length,
    fallbacks: fallback.length,
    ambiguous: fallback.filter((item) => item.reason === "ambiguous_identity").length,
    blocked: fallback.filter((item) => item.reason === "blocked").length,
    httpFailures: fallback.filter((item) => item.reason === "http_failure").length,
    invalidCandidates: fallback.reduce((total, item) => total + (item.invalidCandidates ?? 0), 0),
    http403: fallback.filter((item) => item.pageHttpStatus === 403).length,
    http429: fallback.filter((item) => item.pageHttpStatus === 429).length,
    assetBytes,
    items,
  };
}

function markdown(report: FactoryReport): string {
  const fallbackRows = report.items
    .filter((item) => item.status === "fallback")
    .map((item) => `- **${item.name}** (\`${item.slug}\`): ${item.reason} — ${item.detail ?? ""}`)
    .join("\n");
  return `# SaaSElephant Logo Factory V1

## Summary

- Products considered: ${report.productsConsidered}
- Successful local logos: ${report.successful} (${report.coveragePercent}%)
- Product-specific: ${report.productSpecific}
- Vendor-level: ${report.vendorLogos}
- Favicon-derived: ${report.faviconDerived}
- Fallbacks retained: ${report.fallbacks}
- Ambiguous identity: ${report.ambiguous}
- Blocked: ${report.blocked}
- HTTP failures: ${report.httpFailures}
- Invalid candidates: ${report.invalidCandidates}
- HTTP 403: ${report.http403}
- HTTP 429: ${report.http429}
- Stored asset bytes: ${report.assetBytes}

Successful source URLs and asset hashes are retained in \`docs/software-logo-factory-result.json\`.

## Fallbacks

${fallbackRows || "- None"}
`;
}

function ensureParent(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export async function run(args: readonly string[]): Promise<void> {
  const concurrency = positiveInteger(argumentValue(args, "--concurrency"), 6);
  const timeoutMilliseconds = positiveInteger(argumentValue(args, "--timeout-ms"), 12_000);
  const cacheDirectory = path.resolve(argumentValue(args, "--cache") ?? DEFAULT_CACHE_DIR);
  const outputDirectory = path.resolve(argumentValue(args, "--assets") ?? DEFAULT_OUTPUT_DIR);
  const runtimeManifestPath = path.resolve(
    argumentValue(args, "--manifest") ?? DEFAULT_RUNTIME_MANIFEST,
  );
  const resultPath = path.resolve(argumentValue(args, "--result") ?? DEFAULT_RESULT);
  const reportPath = path.resolve(argumentValue(args, "--report") ?? DEFAULT_REPORT);
  const products = await loadCatalog();
  process.stdout.write(`Logo Factory V1: processing ${products.length} published products.\n`);
  const services = createFetchServices(timeoutMilliseconds, cacheDirectory);
  const acquisitions = rejectSharedAssetCollisions(
    await mapWithConcurrency(products, concurrency, async (product, index) => {
      const result = await acquireProductLogo(product, services);
      if ((index + 1) % 25 === 0 || index + 1 === products.length) {
        process.stdout.write(`Processed ${index + 1}/${products.length}.\n`);
      }
      return result;
    }),
  );

  fs.mkdirSync(outputDirectory, { recursive: true });
  const runtime: RuntimeManifest = { version: LOGO_FACTORY_VERSION, logos: {} };
  const items: ProvenanceItem[] = [];
  let assetBytes = 0;
  for (const acquisition of acquisitions) {
    if (acquisition.status === "fallback") {
      items.push(provenance(acquisition));
      continue;
    }
    const fileName = `${acquisition.product.slug}.${acquisition.image.extension}`;
    const filePath = path.join(outputDirectory, fileName);
    fs.writeFileSync(filePath, acquisition.bytes);
    assetBytes += acquisition.bytes.byteLength;
    const publicPath = `/software-logos/${fileName}`;
    runtime.logos[acquisition.product.slug] = {
      src: publicPath,
      alt: `${acquisition.product.name} logo`,
    };
    items.push(provenance(acquisition, publicPath));
  }

  const report = reportFor(items, assetBytes);
  ensureParent(runtimeManifestPath);
  ensureParent(resultPath);
  ensureParent(reportPath);
  fs.writeFileSync(runtimeManifestPath, `${JSON.stringify(runtime, null, 2)}\n`);
  fs.writeFileSync(resultPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(reportPath, markdown(report));
  process.stdout.write(
    `Acquired ${report.successful}/${report.productsConsidered} logos (${report.coveragePercent}%); ${report.fallbacks} fallbacks retained.\n`,
  );
}
