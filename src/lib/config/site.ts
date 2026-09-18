import type { Metadata } from "next";

// Preserve the host already used by the active sitemap. The root CNAME is legacy.
// Set SITE_URL only after the owner confirms a different canonical production host.
export function siteOrigin(): string {
  const url = new URL(process.env.SITE_URL ?? "https://saaselephant.com");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("SITE_URL must be an HTTPS origin without credentials, path, query or hash.");
  }
  return url.origin;
}

export function publicMetadata(title: string, description: string, pathname: string): Metadata {
  const url = new URL(pathname, siteOrigin()).href;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "SaaSElephant", type: "website" },
    twitter: { card: "summary", title, description },
  };
}
