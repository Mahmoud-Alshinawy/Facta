import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("authentication PKCE", () => {
  it("includes a code challenge in sign-up without contacting a server", async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ id: "fixture-user", aud: "authenticated" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    vi.stubGlobal("fetch", fakeFetch);
    vi.stubGlobal("crypto", webcrypto);
    const { supabase } = await import("./supabase");
    await supabase.auth.signUp({
      email: "fixture@example.invalid",
      password: "test-password",
      options: { emailRedirectTo: "facta://auth/callback" },
    });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const request = fakeFetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(request[1].body));
    expect(body.code_challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.code_challenge_method).toBe("s256");
  });

  it("leaves a browser callback for the bridge to exchange once", async () => {
    const data = new Map<string, string>([
      [
        "sb-placeholder-auth-token-code-verifier",
        JSON.stringify("fixture-verifier"),
      ],
    ]);
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    };
    const fakeFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "fixture error" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubEnv("VITE_SUPABASE_URL", "https://placeholder.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "placeholder");
    vi.stubGlobal("fetch", fakeFetch);
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.stubGlobal("window", {
      location: { href: "https://localhost/?code=fixture-code" },
    });
    vi.stubGlobal("document", {});
    const { supabase } = await import("./supabase");
    await supabase.auth.getSession();
    expect(fakeFetch).not.toHaveBeenCalled();
    await supabase.auth.exchangeCodeForSession("fixture-code");
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const request = fakeFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(request[1].body))).toMatchObject({
      auth_code: "fixture-code",
      code_verifier: "fixture-verifier",
    });
  });

  it("retains the signup verifier after an unconfirmed password sign-in", async () => {
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const fakeFetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, body: JSON.parse(String(init?.body)) });
        if (url.includes("/signup")) {
          return new Response(
            JSON.stringify({ id: "fixture-user", aud: "authenticated" }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response(JSON.stringify({ msg: "Fixture rejection" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      },
    );
    vi.stubGlobal("fetch", fakeFetch);
    vi.stubGlobal("crypto", webcrypto);
    const { supabase } = await import("./supabase");
    await supabase.auth.signUp({
      email: "fixture@example.invalid",
      password: "test-password",
    });
    await supabase.auth.signInWithPassword({
      email: "fixture@example.invalid",
      password: "test-password",
    });
    await supabase.auth.exchangeCodeForSession("fixture-code");
    const exchange = requests.find(({ url }) =>
      url.includes("grant_type=pkce"),
    );
    expect(exchange?.body.auth_code).toBe("fixture-code");
    expect(exchange?.body.code_verifier).toEqual(expect.any(String));
    expect(String(exchange?.body.code_verifier).length).toBeGreaterThanOrEqual(
      43,
    );
    expect(fakeFetch).toHaveBeenCalledTimes(3);
  });

  it("refuses a code exchange without a locally stored verifier", async () => {
    const fakeFetch = vi.fn(async () => {
      throw new Error("Unexpected network request");
    });
    vi.stubGlobal("fetch", fakeFetch);
    vi.stubGlobal("crypto", webcrypto);
    const { supabase } = await import("./supabase");
    const result =
      await supabase.auth.exchangeCodeForSession("unrequested-code");
    expect(result.error).not.toBeNull();
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});
