import type { SupabaseClient } from "@supabase/supabase-js";

/** Revoke other sessions when possible, but allow this device to sign out offline. */
export async function signOutWithLocalFallback(
  auth: Pick<SupabaseClient["auth"], "signOut">,
) {
  const { error } = await auth.signOut();
  if (!error) return;
  const { error: localError } = await auth.signOut({ scope: "local" });
  if (localError) throw localError;
}
