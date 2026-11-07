import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
// The publishable key (sb_publishable_...) replaces the legacy anon JWT, which
// dies when the project's HS256 secret is revoked. The anon key stays as a
// fallback so existing .env files and CI secrets keep building.
const envKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

/** False when the build has no Supabase env vars; sync then stays local-only. */
export const isSupabaseConfigured = Boolean(envUrl && envKey);

// The placeholder keeps auth calls from crashing in an unconfigured build;
// they fail with a network error instead.
export const supabase = createClient<Database>(
  envUrl || "https://placeholder.supabase.co",
  envKey || "placeholder",
);
