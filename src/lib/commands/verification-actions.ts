"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  returnSoftwareToVerification,
  verifySoftware,
  type VerificationCommandResult,
} from "@/lib/commands/verification";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function finish(result: VerificationCommandResult, successResult: "verified" | "reopened"): never {
  if (result.status === "success") {
    revalidatePath("/admin");
    redirect(`/admin?result=${successResult}`);
  }
  if (result.status === "invalid_input") redirect("/admin?result=verification_invalid");
  if (result.status === "not_found" || result.status === "invalid_transition") {
    redirect("/admin?result=verification_stale");
  }
  redirect("/admin?result=verification_unavailable");
}

export async function verifySoftwareAction(formData: FormData): Promise<never> {
  const result = await verifySoftware(field(formData, "record_id"), {
    sourceUrl: field(formData, "source_url"),
    sourceReference: field(formData, "source_reference"),
    notes: field(formData, "notes"),
  });
  return finish(result, "verified");
}

export async function returnSoftwareToVerificationAction(formData: FormData): Promise<never> {
  const result = await returnSoftwareToVerification(
    field(formData, "record_id"),
    field(formData, "reason"),
  );
  return finish(result, "reopened");
}
