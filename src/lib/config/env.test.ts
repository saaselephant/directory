import { describe, expect, it } from "vitest";

import { parsePublicSupabaseConfig } from "./env";

describe("parsePublicSupabaseConfig", () => {
  it("accepts complete public Supabase configuration", () => {
    expect(
      parsePublicSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      }),
    ).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "test-publishable-key",
    });
  });
});
