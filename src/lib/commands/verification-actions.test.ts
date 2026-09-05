import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  verifySoftware: vi.fn(),
  returnSoftwareToVerification: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));
vi.mock("./verification", () => ({
  verifySoftware: mocks.verifySoftware,
  returnSoftwareToVerification: mocks.returnSoftwareToVerification,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { returnSoftwareToVerificationAction, verifySoftwareAction } from "./verification-actions";

function form() {
  const data = new FormData();
  data.set("record_id", "software-1");
  data.set("source_url", "https://vendor.example/product");
  data.set("source_reference", "Pricing page");
  data.set("notes", "Checked");
  data.set("reason", "Product information changed");
  data.set("entity", "affiliate_links");
  data.set("target", "published");
  data.set("actor", "attacker");
  data.set("timestamp", "2099-01-01");
  data.set("returnUrl", "https://attacker.example");
  return data;
}

describe("fixed verification server actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes only fixed verification fields and revalidates admin", async () => {
    mocks.verifySoftware.mockResolvedValue({ status: "success" });
    await expect(verifySoftwareAction(form())).rejects.toThrow("REDIRECT:/admin?result=verified");
    expect(mocks.verifySoftware).toHaveBeenCalledWith("software-1", {
      sourceUrl: "https://vendor.example/product",
      sourceReference: "Pricing page",
      notes: "Checked",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("passes only a fixed record and reason to reopening", async () => {
    mocks.returnSoftwareToVerification.mockResolvedValue({ status: "success" });
    await expect(returnSoftwareToVerificationAction(form())).rejects.toThrow(
      "REDIRECT:/admin?result=reopened",
    );
    expect(mocks.returnSoftwareToVerification).toHaveBeenCalledWith(
      "software-1",
      "Product information changed",
    );
  });

  it.each([
    ["invalid_input", "verification_invalid"],
    ["invalid_transition", "verification_stale"],
    ["not_found", "verification_stale"],
    ["unauthorized", "verification_unavailable"],
    ["unavailable", "verification_unavailable"],
  ])("maps %s to a fixed safe result", async (status, result) => {
    mocks.verifySoftware.mockResolvedValue({ status });
    await expect(verifySoftwareAction(form())).rejects.toThrow(`REDIRECT:/admin?result=${result}`);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
