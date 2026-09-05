import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260904000900_phase3_software_verification_foundation.sql",
  ),
  "utf8",
).toLowerCase();

describe("verification migration security contract", () => {
  it("uses two fixed hardened atomic RPCs", () => {
    expect(sql.match(/create function public\.saaselephant_/g)).toHaveLength(2);
    expect(sql.match(/security definer/g)).toHaveLength(2);
    expect(sql.match(/set search_path = ''/g)).toHaveLength(2);
    expect(sql).not.toMatch(/execute\s+format|execute\s+p_|dynamic sql/);
  });

  it("requires the authenticated active platform administrator", () => {
    expect(sql.match(/auth\.uid\(\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql.match(/role = 'platform_admin'/g)).toHaveLength(2);
    expect(sql.match(/revoked_at is null/g)).toHaveLength(2);
  });

  it("fixes software-only status transitions and event values", () => {
    expect(sql).toContain("previous_status not in ('needs_verification', 'failed', 'stale')");
    expect(sql).toContain("set verification_status = 'verified'");
    expect(sql).toContain("if previous_status <> 'verified'");
    expect(sql).toContain("set verification_status = 'needs_verification'");
    expect(sql).toContain(
      "'software', normalized_software_id, 'catalogue_information', 'verified'",
    );
    expect(sql).toContain(
      "'software', normalized_software_id, 'catalogue_information', 'needs_verification'",
    );
    expect(sql).not.toMatch(/set\s+publication_status/);
  });

  it("keeps direct writes private and grants only RPC execution", () => {
    expect(sql).toContain("from public, anon");
    expect(sql.match(/grant execute on function/g)).toHaveLength(2);
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)/);
    expect(sql).not.toMatch(/affiliate_(programs|links|clicks|conversions)/);
  });

  it("locks before mutation and handles event failures atomically", () => {
    expect(sql.match(/for update/g)).toHaveLength(2);
    expect(sql.match(/insert into public\.verification_events/g)).toHaveLength(2);
    expect(sql.match(/exception\s+when others then\s+return 'unavailable'/g)).toHaveLength(2);
    expect(sql.trim().startsWith("-- saaselephant")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });
});
