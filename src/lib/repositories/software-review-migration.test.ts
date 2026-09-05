import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260905000100_phase3_admin_software_review.sql"),
  "utf8",
).toLowerCase();
const functions = sql.split("create function public.").slice(1);
describe("Step 14 read migration contract (source assertions, not database execution)", () => {
  it("creates exactly two administrator-only fixed text-ID readers", () => {
    expect(functions).toHaveLength(2);
    for (const body of functions) {
      expect(body).toContain("(p_software_id text)");
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = ''");
      expect(body).toContain("auth.uid() is null");
      expect(body).toContain("role_row.user_id = auth.uid()");
      expect(body).toContain("role_row.role = 'platform_admin'");
      expect(body).toContain("role_row.revoked_at is null");
      expect(body).toContain("errcode = '42501'");
      expect(body.indexOf("errcode = '42501'")).toBeLessThan(body.indexOf("return query"));
      expect(body).toContain("length(p_software_id) > 200");
    }
  });
  it("only adds functions and their execution grants", () => {
    expect(sql.match(/grant execute on function/g)).toHaveLength(2);
    expect(sql.match(/from public, anon/g)).toHaveLength(2);
    expect(sql.match(/to authenticated/g)).toHaveLength(2);
    expect(sql).not.toMatch(
      /\b(insert|update|delete|truncate|alter|drop)\b|create policy|grant select|grant all|execute format|execute\s+'|service_role|affiliate/,
    );
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });
  it("selects the exact software with vendor and category context without publication filtering", () => {
    const review = functions[0];
    expect(review).toContain("where s.software_id = btrim(p_software_id)");
    expect(review).toContain("left join public.vendors");
    expect(review).toContain("left join public.software_categories");
    expect(review).toContain("left join public.categories");
    expect(review).not.toContain("= 'published'");
    expect(review).toContain("s.full_description::text");
    expect(review).toContain("c.publication_status");
  });
  it("isolates history, fixes ordering and bounds, and extracts only known string details", () => {
    const history = functions[1];
    expect(history).toContain("e.entity_type = 'software'");
    expect(history).toContain("e.subject = 'catalogue_information'");
    expect(history).toContain("e.entity_id = btrim(p_software_id)");
    expect(history).toContain("order by e.verified_at desc, e.verification_event_id desc");
    expect(history).toContain("limit 50");
    expect(history).toContain("pg_catalog.jsonb_typeof(e.details -> 'notes') = 'string'");
    expect(history).toContain("pg_catalog.jsonb_typeof(e.details -> 'reason') = 'string'");
    expect(history).not.toMatch(/actor_|select e\.\*|returns.*json/);
    expect(history.match(/then e.details ->>/g)).toHaveLength(2);
    expect(history).toContain("select 1 from public.software");
  });
  it("returns only the six approved history columns", () => {
    const header = functions[1].split("language plpgsql")[0];
    expect(header).toMatch(
      /returns table \(\s*result public.saaselephant_verification_status,\s*verified_at timestamptz,\s*source_url text,\s*source_reference text,\s*notes text,\s*reason text\s*\)/,
    );
  });
});
