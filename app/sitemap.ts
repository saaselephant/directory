import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/config/site";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const client = createServerSupabaseClient();
  const paths = ["/", "/software", "/categories", "/privacy", "/terms", "/contact"];
  // Page through both tables; never silently truncate at the API's default row limit.
  for (const table of ["categories", "software"] as const) {
    const prefix = table === "software" ? "/software/" : "/categories/";
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client
        .from(table)
        .select("slug")
        .eq("publication_status", "published")
        .order("slug")
        .range(offset, offset + 499)
        .overrideTypes<{ slug: string }[], { merge: false }>();
      if (error) throw new Error(`Unable to generate published ${table} sitemap.`);
      for (const row of data ?? []) if (row.slug) paths.push(prefix + encodeURIComponent(row.slug));
      if (!data || data.length < 500) break;
    }
  }
  return [...new Set(paths)].map((path) => ({ url: new URL(path, siteOrigin()).href }));
}
