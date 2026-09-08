import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260908000100_phase4_canonical_identity_foundation.sql",
  ),
  "utf8",
).toLowerCase();

describe("canonical identity migration source contract", () => {
  it("creates only the three private identity tables", () => {
    expect(sql.match(/create table public\./g)).toHaveLength(3);
    for (const table of [
      "identity_providers",
      "external_identities",
      "canonical_identity_claims",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all privileges on table public.${table}`);
    }
    expect(sql).not.toMatch(/create policy|grant (select|insert|update|delete|all)/);
  });

  it("preserves canonical IDs and uses the verified live column types", () => {
    expect(sql).toContain(
      "software_id text references public.software(software_id) on delete set null",
    );
    expect(sql).toContain("vendor_id uuid references public.vendors(vendor_id) on delete set null");
    expect(sql).toContain(
      "category_id text references public.categories(category_id) on delete set null",
    );
    expect(sql).not.toMatch(/alter table public\.(software|vendors|categories)/);
  });

  it("uses a case-insensitive provider key and case-sensitive external IDs", () => {
    expect(sql).toContain("on public.identity_providers(lower(provider_key))");
    expect(sql).toContain("unique (provider_id, external_object_type, external_id)");
    expect(sql).not.toMatch(/lower\(external_id\)|citext/);
  });

  it("enforces binding states and prevents fuzzy canonical bindings", () => {
    expect(sql).toContain("num_nonnulls(software_id, vendor_id, category_id) <= 1");
    expect(sql).toContain("match_state in ('auto_matched', 'reviewed_matched')");
    expect(sql).toContain("match_state in ('unmatched', 'ambiguous', 'ignored')");
    expect(sql).toContain("or match_method <> 'fuzzy_suggestion'");
    expect(sql).toContain("match_method = 'reviewed_binding'");
    expect(sql).toContain("new.match_state is not distinct from old.match_state");
  });

  it("allows shared evidence but deduplicates claims per canonical target", () => {
    expect(sql).toContain("saaselephant_identity_claim_software_uq");
    expect(sql).toContain("saaselephant_identity_claim_vendor_uq");
    expect(sql).toContain("saaselephant_identity_claim_category_uq");
    expect(sql).toContain(
      "on public.canonical_identity_claims(claim_type, normalized_value, status)",
    );
    expect(sql).not.toMatch(/unique\s*\(\s*claim_type,\s*claim_scope,\s*normalized_value\s*\)/);
    expect(sql).toContain("saaselephant_identity_claim_domain_normalized");
  });

  it("keeps provider lifecycle independent from canonical deletion", () => {
    expect(sql).toContain("references public.identity_providers(provider_id) on delete restrict");
    expect(sql).toContain("references public.software(software_id) on delete set null");
    expect(sql).toContain("references public.vendors(vendor_id) on delete set null");
    expect(sql).toContain("references public.categories(category_id) on delete set null");
    expect(sql).not.toMatch(/provider_id uuid not null[\s\S]{0,100}on delete cascade/);
  });

  it("seeds deterministic unreviewed claims without product-domain guesses", () => {
    expect(sql).toContain("'phase4_catalog_seed'");
    expect(sql).toContain("'domain', 'official_vendor'");
    expect(sql).not.toContain("'domain', 'product_specific'");
    expect(sql).toMatch(/these claims\s*-- remain unreviewed \(verified_at is null\)/);
    expect(sql).toContain("on conflict (");
  });

  it("does not alter affiliates, routing, clicks, or conversions", () => {
    expect(sql).not.toMatch(
      /affiliate_programs|affiliate_links|affiliate_clicks|affiliate_conversions|saaselephant_software_outbound/,
    );
  });
});
