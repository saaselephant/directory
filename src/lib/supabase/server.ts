import "server-only";

import { getPublicSupabaseConfig } from "@/lib/config/env";

/**
 * Reserved for server-only privileged operations such as validated admin writes,
 * tracked redirects, and webhook handling. It intentionally does not create a
 * service-role client until that capability is implemented and explicitly configured.
 */
export function getServerSupabaseConfig() {
  const publicConfig = getPublicSupabaseConfig();
  return {
    ...publicConfig,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}
