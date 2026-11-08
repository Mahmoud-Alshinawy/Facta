# Moving to a publishable key

28 October 2026; completed 8 November 2026. The code change is merged and all
six owner steps are done (see "Result of the switch" at the end).

The desktop app used to read only `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` (`apps/desktop/src/lib/supabase.ts`). The anon key is a legacy JWT signed with
the project's HS256 secret, so revoking that secret also kills the key. A
publishable key (`sb_publishable_...`) is not a JWT and survives the revocation.

## What was verified

- Installed `@supabase/supabase-js` is **2.110.0**. It passes the key through
  as the `apikey` header and works with a non-JWT key.
- The disposable local stack (Supabase CLI 2.122.0) issues a publishable key.
  `node scripts/run-supabase-acceptance.mjs --publishable-key` runs the full
  Auth/HTTP suite with it instead of the anon key. Result: **ok, 64
  assertions**, the same as the anon-key run. That covers sign-up, mail
  confirmation, sign-in, refresh, recovery, sign-out, shared RPCs, RLS and
  anonymous rejection. The result is saved to `http-publishable-result.json`.
- Not reproducible locally: the local stack still signs user tokens with its
  HS256 secret (no `signing_keys_path`), so "legacy secret revoked, ECC only"
  is untested here. The live project already signs with ECC P-256.

## The change (implemented)

1. `supabase.ts`: read `VITE_SUPABASE_PUBLISHABLE_KEY`, falling back to
   `VITE_SUPABASE_ANON_KEY` so existing `.env` files and CI keep building.
   The `createClient` call itself does not change.
2. `.github/workflows/release.yml`: pass `VITE_SUPABASE_PUBLISHABLE_KEY` from
   a new repository secret of the same name.
3. `docs/supabase.md`: name the new variable. It also refers to a missing
   `.env.example`; add one with both names, empty.
4. `scripts/prepare-shared-native.mjs` can stay as it is: it injects the
   disposable stack's key into the isolated test app.

## Steps for the owner (after the branch is merged)

1. Dashboard → **Project Settings → API Keys**. Copy the publishable key, or
   create one if none is listed.
2. In your local `.env`, add `VITE_SUPABASE_PUBLISHABLE_KEY=<that key>`. Keep
   the anon line for now. Add the same value as a GitHub repository secret
   named `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Rebuild and install (`pnpm tauri build`). Sign out, sign in and confirm
   that sync works.
4. Once every install you use runs that build, delete `VITE_SUPABASE_ANON_KEY`
   from `.env` and from the GitHub secrets.
5. **API Keys → Legacy API keys**: disable the legacy anon and service_role
   keys. Older builds that still carry the anon key stop syncing at this step.
6. **JWT Keys**: confirm ECC P-256 is the current key, then revoke the legacy
   HS256 secret. Access tokens it signed stop working; signed-in apps refresh
   their session automatically, because refresh tokens are not JWTs.

## Result of the switch (8 November 2026)

- Local `.env` now has `VITE_SUPABASE_PUBLISHABLE_KEY`. The existing
  `VITE_SUPABASE_ANON_KEY` line already held the same publishable key rather than
  the legacy anon JWT. `.env` stays git-ignored.
- Both apps built from `main` (1ad6fbc) and installed on the owner's machine.
  The built desktop JS contains the publishable key and no legacy anon JWT.
- On the installed build the owner signed out and back in; a personal change
  showed Synced, the shared card loaded and the shared group opened. Pass.
- Step 4: GitHub `Mahmoud-Alshinawy/facta` now has the secrets
  `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_URL`;
  `VITE_SUPABASE_ANON_KEY` was deleted there and from the old archive repo
  `m-coder7/task-battles`.
- Step 5: the legacy JWT-based API keys (anon, service_role) are disabled.
- Step 6: the current JWT signing key is ECC P-256, and the legacy HS256 secret
  is revoked.
- Facta kept syncing after each of steps 4–6.

## Fallback removed (8 November 2026)

With every build on the publishable key and the legacy keys disabled, the app no
longer reads `VITE_SUPABASE_ANON_KEY`. Removed from `apps/desktop/src/lib/supabase.ts`,
`.env.example`, `.github/workflows/release.yml` and `docs/supabase.md`; the isolated
native test build now injects the local stack's publishable key. Steps 1–2 and 4
above describe the transition and are kept as history.
