import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database";
vi.mock("server-only", () => ({}));
import { getSoftwareReview, getSoftwareVerificationHistory } from "./software-review";

const row = {
  software_id: "SE025",
  software_name: "Slack",
  slug: "slack",
  vendor_name: "Slack Technologies",
  legacy_vendor: "Slack",
  website_url: "https://slack.com",
  short_description: "Messaging",
  full_description: "Team communication",
  best_for: "Teams",
  pricing: "See vendor",
  free_plan: true,
  free_trial: null,
  publication_status: "in_review",
  verification_status: "verified",
  verified_at: "2026-09-05T10:00:00Z",
  category_id: "CAT105",
  category_name: "Communication",
  category_slug: "communication",
  category_publication_status: "in_review",
};
const event = {
  result: "verified",
  verified_at: "2026-09-05T10:00:00Z",
  source_url: "https://slack.com",
  source_reference: "Documentation",
  notes: "Checked",
  reason: null,
};
function client(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { rpc, scoped: { rpc } as unknown as SupabaseClient<Database> };
}
describe("software review repository", () => {
  it("maps unpublished software, vendor and unpublished categories through a fixed RPC", async () => {
    const { scoped, rpc } = client([
      row,
      { ...row, category_id: "CAT106", category_name: "Collaboration" },
    ]);
    const result = await getSoftwareReview("SE025", scoped);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("saaselephant_get_software_review", {
      p_software_id: "SE025",
    });
    expect(result).toMatchObject({
      status: "success",
      review: {
        name: "Slack",
        vendorName: "Slack Technologies",
        legacyVendor: "Slack",
        fullDescription: "Team communication",
        publicationStatus: "in_review",
        categories: [{ id: "CAT105", publicationStatus: "in_review" }, { id: "CAT106" }],
      },
    });
  });
  it("handles absent vendor and categories", async () => {
    const { scoped } = client([
      { ...row, vendor_name: null, category_id: null, category_name: null },
    ]);
    expect(await getSoftwareReview("SE025", scoped)).toMatchObject({
      status: "success",
      review: { vendorName: null, legacyVendor: "Slack", categories: [] },
    });
  });
  it("normalizes malformed optional data without coercing facts", async () => {
    const { scoped } = client([
      {
        ...row,
        full_description: {},
        free_plan: "true",
        verified_at: "bad",
        pricing: 20,
        verification_status: "approved",
      },
    ]);
    expect(await getSoftwareReview("SE025", scoped)).toMatchObject({
      status: "success",
      review: {
        fullDescription: null,
        freePlan: null,
        verifiedAt: null,
        pricing: null,
        verificationStatus: null,
      },
    });
  });
  it("distinguishes not found from database error", async () => {
    expect(await getSoftwareReview("SE025", client([]).scoped)).toEqual({ status: "not_found" });
    expect(
      await getSoftwareReview("SE025", client(null, { message: "secret SQL" }).scoped),
    ).toEqual({ status: "error" });
  });
  it.each([null, {}, [null], [{ ...row, software_id: "OTHER" }], [{ ...row, category_id: 42 }]])(
    "rejects malformed result %#",
    async (data) => {
      expect(await getSoftwareReview("SE025", client(data).scoped)).toEqual({ status: "error" });
    },
  );
  it.each(["", "x".repeat(201), "SE\u000025"])(
    "rejects an invalid identifier before RPC %#",
    async (id) => {
      const { scoped, rpc } = client([row]);
      expect(await getSoftwareReview(id, scoped)).toEqual({ status: "not_found" });
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it("maps only explicit fields, discarding unexpected private properties", async () => {
    const result = await getSoftwareReview(
      "SE025",
      client([{ ...row, actor_user_id: "secret", affiliate_url: "private-destination" }]).scoped,
    );
    expect(JSON.stringify(result)).not.toMatch(/actor|affiliate|private-destination|secret/);
  });
  it("sanitizes thrown transport failures", async () => {
    const { scoped, rpc } = client([]);
    rpc.mockRejectedValue(new Error("secret SQL"));
    expect(await getSoftwareReview("SE025", scoped)).toEqual({ status: "error" });
    expect(await getSoftwareVerificationHistory("SE025", scoped)).toEqual({ status: "error" });
  });
});

describe("software review history", () => {
  it("preserves database order and maps evidence and reopening reason without private properties", async () => {
    const { scoped, rpc } = client([
      { ...event, actor_user_id: "secret", details: { arbitrary: true } },
      {
        ...event,
        result: "needs_verification",
        verified_at: "2026-09-04T10:00:00Z",
        source_url: null,
        source_reference: null,
        notes: null,
        reason: "Changed",
      },
    ]);
    const result = await getSoftwareVerificationHistory("SE025", scoped);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("saaselephant_get_software_verification_history", {
      p_software_id: "SE025",
    });
    expect(result).toEqual({
      status: "success",
      events: [
        {
          result: "verified",
          verifiedAt: event.verified_at,
          sourceUrl: event.source_url,
          sourceReference: "Documentation",
          notes: "Checked",
          reason: null,
        },
        {
          result: "needs_verification",
          verifiedAt: "2026-09-04T10:00:00Z",
          sourceUrl: null,
          sourceReference: null,
          notes: null,
          reason: "Changed",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/actor|details|arbitrary|secret/);
  });
  it("distinguishes empty history and errors", async () => {
    expect(await getSoftwareVerificationHistory("SE025", client([]).scoped)).toEqual({
      status: "success",
      events: [],
    });
    expect(
      await getSoftwareVerificationHistory("SE025", client(null, { message: "secret" }).scoped),
    ).toEqual({ status: "error" });
  });
  it("accepts 50 rows and rejects a response outside the fixed bound", async () => {
    expect(
      await getSoftwareVerificationHistory("SE025", client(Array(50).fill(event)).scoped),
    ).toMatchObject({ status: "success" });
    expect(
      await getSoftwareVerificationHistory("SE025", client(Array(51).fill(event)).scoped),
    ).toEqual({ status: "error" });
  });
  it.each([
    null,
    {},
    [null],
    [{ ...event, result: "approved" }],
    [{ ...event, verified_at: "bad" }],
  ])("rejects malformed history %#", async (data) => {
    expect(await getSoftwareVerificationHistory("SE025", client(data).scoped)).toEqual({
      status: "error",
    });
  });
  it("does not stringify malformed optional notes or evidence", async () => {
    expect(
      await getSoftwareVerificationHistory(
        "SE025",
        client([{ ...event, notes: {}, reason: [], source_url: 42 }]).scoped,
      ),
    ).toMatchObject({
      status: "success",
      events: [{ notes: null, reason: null, sourceUrl: null }],
    });
  });
  it("rejects invalid IDs without making a history call", async () => {
    const { scoped, rpc } = client([]);
    expect(await getSoftwareVerificationHistory("", scoped)).toEqual({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
