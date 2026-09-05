"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { setPublicationStatus, type PublicationCommandResult } from "@/lib/commands/publication";

type ActionOutcome = "published" | "returned";

function readRecordId(formData: FormData) {
  const value = formData.get("record_id");
  return typeof value === "string" ? value : "";
}

function revalidateCatalogueRoutes() {
  revalidatePath("/admin");
  revalidatePath("/software");
  revalidatePath("/software/[slug]", "page");
  revalidatePath("/categories");
  revalidatePath("/categories/[slug]", "page");
}

function finishAction(result: PublicationCommandResult, outcome: ActionOutcome): never {
  if (result.status === "success") {
    revalidateCatalogueRoutes();
    redirect(`/admin?result=${outcome}`);
  }

  if (result.status === "invalid_transition") {
    redirect("/admin?result=stale");
  }

  redirect("/admin?result=unavailable");
}

export async function publishSoftware(formData: FormData): Promise<never> {
  const result = await setPublicationStatus("software", readRecordId(formData), "published");
  return finishAction(result, "published");
}

export async function returnSoftwareToReview(formData: FormData): Promise<never> {
  const result = await setPublicationStatus("software", readRecordId(formData), "in_review");
  return finishAction(result, "returned");
}

export async function publishCategory(formData: FormData): Promise<never> {
  const result = await setPublicationStatus("category", readRecordId(formData), "published");
  return finishAction(result, "published");
}

export async function returnCategoryToReview(formData: FormData): Promise<never> {
  const result = await setPublicationStatus("category", readRecordId(formData), "in_review");
  return finishAction(result, "returned");
}
