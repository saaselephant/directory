import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getPublicSupabaseConfig } from "@/lib/config/env";
import type { Database } from "@/types/database";

/**
 * Creates a server-only client with the same public credentials used by anonymous
 * visitors. Database access remains constrained by production RLS policies.
 */
export function createServerSupabaseClient() {
  const { url, publishableKey } = getPublicSupabaseConfig();

  return createClient<Database>(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
