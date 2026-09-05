import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAdmin } from "@/lib/auth/admin";
import type { Database, PublicationStatus } from "@/types/database";

export type PublishableEntity = "software" | "category";
export type PublicationTarget = Extract<PublicationStatus, "in_review" | "published">;

export type PublicationCommandResult =
  | { status: "success" }
  | { status: "unauthenticated" | "forbidden" | "invalid_transition" | "error" };

const TRANSITION_SOURCE: Record<PublicationTarget, PublicationTarget> = {
  published: "in_review",
  in_review: "published",
};

export function isPublishableEntity(value: string): value is PublishableEntity {
  return value === "software" || value === "category";
}

export function isPublicationTarget(value: string): value is PublicationTarget {
  return value === "in_review" || value === "published";
}

export async function setPublicationStatus(
  entity: PublishableEntity | string,
  id: string,
  target: PublicationTarget,
  client?: SupabaseClient<Database>,
): Promise<PublicationCommandResult> {
  if (!isPublishableEntity(entity) || !id || id.length > 200 || !isPublicationTarget(target)) {
    return { status: "invalid_transition" };
  }

  const authorization = await requireAdmin(client);
  if (authorization.status !== "authorized") return { status: authorization.status };

  // The hand-maintained schema contract is authoritative at the row level, while
  // PostgREST's mutation overload currently resolves its generic payload to never.
  const update = { publication_status: target } as never;

  const query =
    entity === "software"
      ? authorization.client
          .from("software")
          .update(update)
          .eq("software_id", id)
          .eq("publication_status", TRANSITION_SOURCE[target])
          .select("software_id")
          .maybeSingle()
      : authorization.client
          .from("categories")
          .update(update)
          .eq("category_id", id)
          .eq("publication_status", TRANSITION_SOURCE[target])
          .select("category_id")
          .maybeSingle();
  const { data, error } = await query;

  if (error) return { status: "error" };
  if (!data) return { status: "invalid_transition" };
  return { status: "success" };
}
