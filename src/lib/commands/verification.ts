import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAdmin } from "@/lib/auth/admin";
import type { Database } from "@/types/database";
import type { SoftwareVerificationEvidence } from "@/types/models";

export type VerificationCommandResult = {
  status:
    | "success"
    | "unauthorized"
    | "invalid_input"
    | "not_found"
    | "invalid_transition"
    | "unavailable";
};

const RESULT_STATUSES = new Set<VerificationCommandResult["status"]>([
  "success",
  "unauthorized",
  "invalid_input",
  "not_found",
  "invalid_transition",
  "unavailable",
]);

type VerificationRpcClient = {
  rpc(
    name: "saaselephant_verify_software",
    args: Database["public"]["Functions"]["saaselephant_verify_software"]["Args"],
  ): PromiseLike<{ data: string | null; error: unknown }>;
  rpc(
    name: "saaselephant_return_software_to_verification",
    args: Database["public"]["Functions"]["saaselephant_return_software_to_verification"]["Args"],
  ): PromiseLike<{ data: string | null; error: unknown }>;
};

function normalizeOptional(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function validSoftwareId(value: string) {
  return value.trim().length > 0 && value.trim().length <= 200;
}

function validEvidenceUrl(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 2048) return false;

  try {
    const url = new URL(normalized);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname.includes(".") &&
      !url.hostname.startsWith(".") &&
      !url.hostname.endsWith(".")
    );
  } catch {
    return false;
  }
}

function safeRpcResult(data: unknown, error: unknown): VerificationCommandResult {
  if (error || typeof data !== "string" || !RESULT_STATUSES.has(data as never)) {
    return { status: "unavailable" };
  }
  return { status: data as VerificationCommandResult["status"] };
}

async function authorizedClient(client?: SupabaseClient<Database>) {
  const authorization = await requireAdmin(client);
  if (authorization.status === "authorized") return authorization.client;
  if (authorization.status === "unauthenticated" || authorization.status === "forbidden") {
    return null;
  }
  return undefined;
}

export async function verifySoftware(
  recordId: string,
  evidence: SoftwareVerificationEvidence,
  client?: SupabaseClient<Database>,
): Promise<VerificationCommandResult> {
  const normalizedId = recordId.trim();
  const sourceUrl = evidence.sourceUrl.trim();
  const sourceReference = normalizeOptional(evidence.sourceReference);
  const notes = normalizeOptional(evidence.notes);

  if (
    !validSoftwareId(recordId) ||
    !validEvidenceUrl(sourceUrl) ||
    (sourceReference?.length ?? 0) > 500 ||
    (notes?.length ?? 0) > 2000
  ) {
    return { status: "invalid_input" };
  }

  const scopedClient = await authorizedClient(client);
  if (scopedClient === null) return { status: "unauthorized" };
  if (!scopedClient) return { status: "unavailable" };

  const rpcClient = scopedClient as unknown as VerificationRpcClient;
  const { data, error } = await rpcClient.rpc("saaselephant_verify_software", {
    p_software_id: normalizedId,
    p_source_url: sourceUrl,
    p_source_reference: sourceReference,
    p_notes: notes,
  });
  return safeRpcResult(data, error);
}

export async function returnSoftwareToVerification(
  recordId: string,
  reason: string,
  client?: SupabaseClient<Database>,
): Promise<VerificationCommandResult> {
  const normalizedId = recordId.trim();
  const normalizedReason = reason.trim();
  if (!validSoftwareId(recordId) || !normalizedReason || normalizedReason.length > 2000) {
    return { status: "invalid_input" };
  }

  const scopedClient = await authorizedClient(client);
  if (scopedClient === null) return { status: "unauthorized" };
  if (!scopedClient) return { status: "unavailable" };

  const rpcClient = scopedClient as unknown as VerificationRpcClient;
  const { data, error } = await rpcClient.rpc("saaselephant_return_software_to_verification", {
    p_software_id: normalizedId,
    p_reason: normalizedReason,
  });
  return safeRpcResult(data, error);
}
