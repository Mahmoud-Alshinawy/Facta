import { describe, expect, it, vi } from "vitest";
import { AuthError } from "@supabase/supabase-js";
import { signOutWithLocalFallback } from "./signOut";

describe("signOutWithLocalFallback", () => {
  it("finishes sign-out when remote revocation fails but local sign-out succeeds", async () => {
    const signOut = vi.fn()
      .mockResolvedValueOnce({ error: new AuthError("Offline") })
      .mockResolvedValueOnce({ error: null });
    await expect(signOutWithLocalFallback({ signOut })).resolves.toBeUndefined();
    expect(signOut.mock.calls).toEqual([[], [{ scope: "local" }]]);
  });

  it("surfaces only the local failure when both attempts fail", async () => {
    const localError = new AuthError("Local storage unavailable");
    const signOut = vi.fn()
      .mockResolvedValueOnce({ error: new AuthError("Offline") })
      .mockResolvedValueOnce({ error: localError });
    await expect(signOutWithLocalFallback({ signOut })).rejects.toBe(localError);
  });

  it("does not repeat a successful remote sign-out", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    await signOutWithLocalFallback({ signOut });
    expect(signOut).toHaveBeenCalledExactlyOnceWith();
  });
});
