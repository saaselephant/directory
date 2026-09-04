import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@/lib/config/env";

/**
 * Creates a browser-safe client only when a public route needs data.
 * No application route calls this during Phase 1, so this cannot contact Supabase yet.
 */
export function createPublicSupabaseClient() {
  const { url, publishableKey } = getPublicSupabaseConfig();
  return createClient(url, publishableKey);
}
