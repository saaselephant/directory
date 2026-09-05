import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  setPublicationStatus: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));
vi.mock("./publication", () => ({ setPublicationStatus: mocks.setPublicationStatus }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  publishCategory,
  publishSoftware,
  returnCategoryToReview,
  returnSoftwareToReview,
} from "./publication-actions";

function form(id = "record-1") {
  const data = new FormData();
  data.set("record_id", id);
  data.set("entity", "affiliate_links");
  data.set("target", "archived");
  data.set("returnUrl", "https://attacker.example");
  return data;
}

describe("fixed publication server actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [publishSoftware, "software", "published", "published"],
    [returnSoftwareToReview, "software", "in_review", "returned"],
    [publishCategory, "category", "published", "published"],
    [returnCategoryToReview, "category", "in_review", "returned"],
  ] as const)("fixes entity and target server-side", async (action, entity, target, result) => {
    mocks.setPublicationStatus.mockResolvedValue({ status: "success" });
    await expect(action(form())).rejects.toThrow(`REDIRECT:/admin?result=${result}`);
    expect(mocks.setPublicationStatus).toHaveBeenCalledWith(entity, "record-1", target);
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/admin"],
      ["/software"],
      ["/software/[slug]", "page"],
      ["/categories"],
      ["/categories/[slug]", "page"],
    ]);
  });

  it("returns a generic stale result without revalidation", async () => {
    mocks.setPublicationStatus.mockResolvedValue({ status: "invalid_transition" });
    await expect(publishSoftware(form())).rejects.toThrow("REDIRECT:/admin?result=stale");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["unauthenticated", "forbidden", "error"])(
    "returns a generic unavailable result for %s",
    async (status) => {
      mocks.setPublicationStatus.mockResolvedValue({ status });
      await expect(publishCategory(form())).rejects.toThrow("REDIRECT:/admin?result=unavailable");
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );
});
