import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const envAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

/** False when the build has no Supabase env vars; sync then stays local-only. */
export const isSupabaseConfigured = Boolean(envUrl && envAnonKey);

// The placeholder keeps auth calls from crashing in an unconfigured build;
// they fail with a network error instead.
export const supabase = createClient<Database>(
  envUrl || "https://placeholder.supabase.co",
  envAnonKey || "placeholder",
);
