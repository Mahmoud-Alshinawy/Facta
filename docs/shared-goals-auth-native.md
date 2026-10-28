# Remaining acceptance: real local Auth/HTTP and native providers

28 October 2026. Branch `feat/shared-goals`; owner approved `dcfe07a` and
authorized remaining acceptance only. **Full acceptance remains incomplete.
Stop for final review; do not merge.** No application or migration changes.

## Docker diagnosis and recovery

- Reproduced with `docker desktop start` and `docker info`: Linux engine pipe
  absent; host backend fails renaming `Docker/run/sailor-ingest.sock` to `.stale`
  with Windows Error 1920. The runtime directory contained six zero-byte reparse
  objects; even a read-only reparse query on the affected object failed.
- With Desktop stopped and no backend process found, renamed only that runtime
  directory to its sibling `run.facta-acceptance-20261028-1`, preserving its
  contents, and created an empty `run`. This advanced startup to a second
  failure at `docker-secrets-engine/engine.sock`. That directory was not changed.
- The owner then opened the engine through Docker. Verified Engine **29.7.2**
  responding. After a laptop crash, a normal startup/owner intervention restored
  the engine again and the disposable database survived. This does **not**
  establish a permanent repair or prove a specific Windows kernel cause.
- Ordinary file rename passed. Fresh .NET AF_UNIX bind passed; its endpoint was
  automatically removed on disposal, so the attempted post-disposal rename was
  inconclusive. Bundled Python lacks AF_UNIX; an initial .NET path exceeded the
  socket length limit and was corrected. No general socket-rename conclusion.
- No factory reset, prune, VM disk deletion/restore, WSL unregister, ACL rewrite,
  OS security change or Docker settings edit. Original runtime objects remain
  in the sibling backup. Existing Docker data/resources were not removed.

Upstream reports describe the same host runtime failure and directory-level
workaround; these are reports, not proof of this machine's underlying cause:
[Docker #554](https://github.com/docker/desktop-feedback/issues/554),
[Docker #676](https://github.com/docker/desktop-feedback/issues/676).

## Disposable stack and identity boundary

- Temporary **Supabase CLI 2.122.0**, outside workspace dependencies. Project
  `facta-acceptance-20261028` lives under ignored `tmp/supabase-acceptance`.
  API `127.0.0.1:56421`, DB `56422`, local mail capture `56424`.
- Copied and applied all four repository migration files to this new local
  stack. No `.env`, linked/cloud project, live credentials or live Supabase.
  CLI started the full stack despite requested exclusions; unused test services
  were subsequently stopped by verified project label to reduce laptop load.
- PostgreSQL **17.11**, PostgREST **16.5**, real GoTrue, gateway and captured mail.
  Email confirmation enabled; access-token lifetime **120 seconds** to exercise
  actual expiry. No Auth/PostgREST clock replacement.
- Auth/HTTP identities below are actual local Auth users with issued sessions.
  They do not use `fixture.<uuid>`, an `auth.uid()` scaffold or the earlier
  SQL bridge. Deliberately signed negative JWT probes are identified separately.
- Local keys, credentials and callback URLs stay in ignored test files and must
  not be committed. CLI's source-tree version marker was moved into ignored
  artifacts; unrelated `.agents/` and `skills-lock.json` remain untouched.

## Real Auth/JWT/PostgREST results

Reproducible entry: `node scripts/run-supabase-acceptance.mjs`, after preparing
the dedicated local stack and privately saving CLI status to
`tmp/supabase-acceptance/status.json`. The runner rejects any other API URL.
Result: `http-result.json` in that directory. Its overall **`ok:false` is
intentional evidence of the remaining claim-validation gaps**, not a baseline
unit-test failure or an acceptance pass.

The final post-crash run passed **48 assertions**, including a required
same-signer positive control before the signed negative-claim probes. The
pre-crash run passed 47 before that explicit assertion was added; both observed
the same two claim-policy gaps.

The assertions cover:

- Sign-up without premature session, unconfirmed sign-in rejection, real local
  email capture/confirmation, persisted SDK session restoration and HTTP user
  validation; refresh rotation with unchanged identity.
- Password recovery verification/update; old-password rejection and new-password
  login; sign-out clears the session and the server rejects its refresh token.
- A naturally issued access token expires on the actual clock, is rejected by
  both services, and its still-valid refresh session recovers.
- Production `createSharedRemote`: profiles, draft/publication, identical UUID/
  body receipt replay, Unicode JSON/date mapping, authenticated preview, join
  with `eligible_round` and exact receipt replay, snapshot and leave.
- A nonmember cannot read another group's table rows, archive it or obtain it
  through a snapshot. All four shared RPCs reject anonymous calls. Anonymous
  table reads reveal no group rows; direct membership writes and HTTP private
  token-schema access are rejected; unknown RPC payload keys are rejected.

Claim probes use the **disposable server signing key**, with a valid-claims
positive control succeeding on both services. They do not demonstrate a client
forging a token without a signing key. The key never comes from a live project.

| Probe                           | Auth HTTP | PostgREST HTTP |
| ------------------------------- | --------- | -------------- |
| Altered signature               | 403       | 401            |
| Unsigned token                  | 403       | 401            |
| Same local signer, valid claims | 200       | 200            |
| Signed expired token            | 403       | 401            |
| Signed future `nbf`             | 403       | 401            |
| Signed wrong audience           | **200**   | **200**        |
| Signed wrong issuer             | **200**   | **200**        |

**Strict audience/issuer rejection is not established by local defaults.**
There was no `PGRST_JWT_AUD` environment setting. PostgREST documents audience
validation as configurable ([configuration reference](https://docs.postgrest.org/en/stable/references/configuration.html#jwt-aud)).
No server policy was silently changed to make these probes pass. A reviewed
deployment policy/configuration and its verification remain required; no claim
about a hosted project's settings. Signature, time and RLS results above do not
substitute for that decision. No production database security change was made.

## Native production-provider evidence, without screen takeover

`prepare-shared-native.mjs --real-auth` builds the actual `main.tsx`, AuthProvider
and SyncProvider, without identity aliases or manually opened engines. Copies
use `app.facta.acceptance.*`, separate WebView/shared-data directories under
`tmp/shared-native-auth`, and **`facta-acceptance://` only**. Test copies retain
normal widget bottom-stacking and the real quit implementation; no foreground
override or injected test Quit command. Autostart writes and installed-companion
launching are disabled in copies. No installer or installed handler was changed.

- `prepare-native-auth-fixture.mjs` provisions/reuses two actual Auth accounts
  (preconfirmed through the local admin API; not evidence of native sign-up UI).
  It creates a historical group through authenticated RPCs, temporarily moving
  **only the private domain creation clock**, restores it in `finally`, then
  seeds yesterday's occurrence on the normal clock. Auth/JWT clocks stay real.
- Inspected native signed-out startup. A real password grant obtained a session
  through HTTP, delivered via the isolated test-scheme callback. Actual Rust
  export then matched that user, one personal goal and one active shared group
  with confirmed **50%/0%**, in a **1,607-byte** file. Audit counts showed real
  token refresh/rotation while the app remained running.
- The owner pressed physical Escape, then requested no screen interaction
  during class. **All Computer Use stopped.** No sign-in form, tray menu,
  companion pointer or subsequent native visual claim is made from this run.
- Background-only real-session regression passed **12 assertions**, repeated
  on a fresh group after correcting a test setup field. Two independently
  signed-in sessions for the same account exercised identical receipt replay
  and a stale opposing check-in conflict. The production native polling path
  automatically exported **100%**, matching the real scoring-view snapshot;
  personal completion was unchanged. Ownership transfer/leave then removed all
  shared rows from the native export while retaining the personal goal.
- Entry: `node scripts/run-supabase-acceptance.mjs --native-background`.
  `native-background-result.json` records the final run. It makes no native
  pointer/keyboard/visual assertion. Two sessions on one host are not two devices.

## Open gates and environment left for resumption

- Strict audience/issuer policy/verification above remains open.
- Windows Sandbox is absent and the owner has no known disposable Windows VM.
  Production installation/autostart registration, `facta://` handler, packaged
  warm/cold/auth links and production companion launching need an isolated
  Windows environment. The real-provider test scheme cannot establish them.
- Actual tray Quit, native pending-write quit/restart with real Auth, normal
  bottom-stacking under occlusion, companion Open group/file watching with real
  Auth, account-switch cleanup via the production UI, native OS-network outage/
  reconnect and separate hardware devices remain unverified here. Earlier
  synthetic/test-scheme evidence in `shared-goals-step6.md` remains distinct.
- At the owner's request, the isolated native window is left alone; no forced
  termination or UI cleanup. Its test-scheme handler and core disposable services
  remain available for resumption. Do not operate on installed Facta or switch
  its production handler. Original Docker runtime backup is preserved.

Required checks passed: frozen install; all three TypeScript checks;
**437 desktop / 194 calendar Vitest tests**; desktop PORT=1420 BASE_PATH=/ build;
widgets build; both production Windows cargo checks. Existing desktop chunk
warning remains (~808 KB). Earlier full-App/SQL/concurrency suites were not
rerun for this test/documentation-only follow-up. No application behavior,
dependency, migration or RLS/scoring source changed in this acceptance follow-up.
**Do not merge or claim full acceptance.**
