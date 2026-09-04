import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

/** Creates a cookie-aware client that acts only as the current signed-in user. */
export async function createAuthenticatedServerSupabaseClient() {
  const { url, publishableKey } = getPublicSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies. Middleware or a Server Action
          // may refresh them when an auth flow is introduced.
        }
      },
    },
  });
}
