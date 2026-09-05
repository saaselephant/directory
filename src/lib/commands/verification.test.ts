import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));
const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin }));

import { returnSoftwareToVerification, verifySoftware } from "./verification";

function authorizedClient(
  result: { data: unknown; error: unknown } = { data: "success", error: null },
) {
  const rpc = vi.fn().mockResolvedValue(result);
  const client = { rpc } as unknown as SupabaseClient<Database>;
  requireAdmin.mockResolvedValue({ status: "authorized", client, user: { id: "admin-1" } });
  return { client, rpc };
}

describe("software verification commands", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls the fixed verification RPC with normalized evidence", async () => {
    const { client, rpc } = authorizedClient();
    await expect(
      verifySoftware(
        " software-1 ",
        {
          sourceUrl: " https://vendor.example/product ",
          sourceReference: " Pricing ",
          notes: " Checked ",
        },
        client,
      ),
    ).resolves.toEqual({ status: "success" });
    expect(requireAdmin).toHaveBeenCalledWith(client);
    expect(rpc).toHaveBeenCalledWith("saaselephant_verify_software", {
      p_software_id: "software-1",
      p_source_url: "https://vendor.example/product",
      p_source_reference: "Pricing",
      p_notes: "Checked",
    });
  });

  it("calls only the fixed return RPC", async () => {
    const { client, rpc } = authorizedClient();
    await expect(
      returnSoftwareToVerification(" software-1 ", " Changed ", client),
    ).resolves.toEqual({
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("saaselephant_return_software_to_verification", {
      p_software_id: "software-1",
      p_reason: "Changed",
    });
  });

  it.each(["unauthenticated", "forbidden"])("denies %s callers before RPC", async (status) => {
    requireAdmin.mockResolvedValue({ status });
    const client = { rpc: vi.fn() } as unknown as SupabaseClient<Database>;
    await expect(
      verifySoftware("software-1", { sourceUrl: "https://vendor.example" }, client),
    ).resolves.toEqual({ status: "unauthorized" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("fails safely when authorization is unavailable", async () => {
    requireAdmin.mockResolvedValue({ status: "error" });
    const client = { rpc: vi.fn() } as unknown as SupabaseClient<Database>;
    await expect(returnSoftwareToVerification("software-1", "Changed", client)).resolves.toEqual({
      status: "unavailable",
    });
  });

  it.each([
    ["", "https://vendor.example", null, null],
    ["x".repeat(201), "https://vendor.example", null, null],
    ["software-1", "", null, null],
    ["software-1", "http://vendor.example", null, null],
    ["software-1", "javascript:alert(1)", null, null],
    ["software-1", "data:text/plain,test", null, null],
    ["software-1", "not a url", null, null],
    ["software-1", `https://vendor.example/${"x".repeat(2049)}`, null, null],
    ["software-1", "https://vendor.example", "x".repeat(501), null],
    ["software-1", "https://vendor.example", null, "x".repeat(2001)],
  ])("rejects invalid verification evidence %#", async (id, url, sourceReference, notes) => {
    const { client, rpc } = authorizedClient();
    await expect(
      verifySoftware(id, { sourceUrl: url, sourceReference, notes }, client),
    ).resolves.toEqual({ status: "invalid_input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["", "x".repeat(2001)])("requires a bounded reopen reason", async (reason) => {
    const { client, rpc } = authorizedClient();
    await expect(returnSoftwareToVerification("software-1", reason, client)).resolves.toEqual({
      status: "invalid_input",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["unauthorized", "invalid_input", "not_found", "invalid_transition", "unavailable"])(
    "preserves safe RPC result %s",
    async (status) => {
      const { client } = authorizedClient({ data: status, error: null });
      await expect(
        verifySoftware("software-1", { sourceUrl: "https://vendor.example" }, client),
      ).resolves.toEqual({ status });
    },
  );

  it("hides database errors and unexpected RPC results", async () => {
    const failing = authorizedClient({ data: null, error: { message: "private SQL" } });
    await expect(
      verifySoftware("software-1", { sourceUrl: "https://vendor.example" }, failing.client),
    ).resolves.toEqual({ status: "unavailable" });
    const unexpected = authorizedClient({ data: "published", error: null });
    await expect(
      returnSoftwareToVerification("software-1", "Changed", unexpected.client),
    ).resolves.toEqual({
      status: "unavailable",
    });
  });
});
