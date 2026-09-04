import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createAuthenticatedServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type AdminAuthorizationResult =
  | { status: "authorized"; user: User; client: SupabaseClient<Database> }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "error" };

export async function requireAdmin(
  client?: SupabaseClient<Database>,
): Promise<AdminAuthorizationResult> {
  const authenticatedClient = client ?? (await createAuthenticatedServerSupabaseClient());
  const { data: authData, error: authError } = await authenticatedClient.auth.getUser();

  if (authError || !authData.user) return { status: "unauthenticated" };

  const { data: role, error: roleError } = await authenticatedClient
    .from("user_roles")
    .select("user_id")
    .eq("user_id", authData.user.id)
    .eq("role", "platform_admin")
    .is("revoked_at", null)
    .maybeSingle();

  if (roleError) return { status: "error" };
  if (!role) return { status: "forbidden" };
  return { status: "authorized", user: authData.user, client: authenticatedClient };
}
