type Environment = Record<string, string | undefined>;

export type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
};

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} must be configured.`);
  }

  return value;
}

export function parsePublicSupabaseConfig(env: Environment): PublicSupabaseConfig {
  const url = required(env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = required(
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("invalid protocol");
    }
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid HTTP(S) URL.");
  }

  return { url, publishableKey };
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  return parsePublicSupabaseConfig(process.env);
}
