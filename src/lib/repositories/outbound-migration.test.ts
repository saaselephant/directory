import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260905000200_phase3_affiliate_outbound.sql"),
  "utf8",
).toLowerCase();
describe("outbound SQL source contract (no database execution)", () => {
  it("adds only one fixed public redirect, leaves tables private and the old selector untouched", () => {
    expect(sql.match(/create function/g)).toHaveLength(1);
    expect(sql).toContain("p_software_slug text");
    expect(sql).toContain("returns void");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to anon");
    expect(sql).not.toMatch(
      /grant\s+(select|insert|update|delete)|alter table|create policy|execute format|saaselephant_select_verified|service_role|insert into|update public/,
    );
  });
  it("requires published software and an eligible verified program and link", () => {
    expect(sql).toContain("s.publication_status = 'published'");
    expect(sql).toContain("program.software_id = link.software_id");
    expect(sql).toContain("program.affiliate_id = link.affiliate_program_id");
    for (const predicate of [
      "lower(btrim(program.status)) = 'active'",
      "program.verification_status = 'verified'",
      "program.verified_at is not null",
      "link.status = 'active'",
      "link.verification_status = 'verified'",
      "link.verified_at is not null",
      "link.valid_from <= now()",
      "link.valid_until > now()",
      "program.verified_at <= now()",
      "link.verified_at <= now()",
    ])
      expect(sql).toContain(predicate);
    expect(sql).toContain("order by link.priority desc, link.affiliate_link_id asc");
    expect(sql).toContain("limit 1");
  });
  it("validates selected and fallback URLs and returns only no-store redirect headers", () => {
    expect(sql).toContain("link.destination_url ~* https_pattern");
    expect(sql).toContain("official_url ~* https_pattern");
    expect(sql).toContain("length(link.destination_url) <= 2048");
    expect(sql).toContain("response.status', '303'");
    expect(sql).toContain("response.status', '404'");
    expect(sql).toContain("jsonb_build_object('location', outbound_url)");
    expect(sql).toContain("jsonb_build_object('cache-control', 'no-store')");
    expect(sql).not.toContain("return outbound_url");
  });
  it("has no analytics dependency or stored production referral URL", () => {
    expect(sql).not.toMatch(/affiliate_clicks|affiliate_conversions|trypipedrive|partnerstack/);
    const repository = readFileSync(
      join(process.cwd(), "src/lib/repositories/outbound.ts"),
      "utf8",
    );
    expect(repository).not.toMatch(
      /service_role|affiliate_clicks|affiliate_conversions|trypipedrive/i,
    );
  });
});
