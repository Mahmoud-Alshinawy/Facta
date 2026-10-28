# Proposed deployment policy: access-token audience and issuer

**Proposal for owner review. Not implemented, deployed or verified.**
28 October 2026. No live configuration, client checks or migrations changed.
The baseline local stack still accepts same-key signed wrong-audience/issuer
tokens; the overall acceptance status remains incomplete.

## Intended contract

For requests acting as a signed-in Facta user, require all of:

- A valid signature from that environment's configured Supabase signing keys,
  with an explicit allowed algorithm/key set. Never discover trust from an
  unverified token's issuer, `jku`, URL or client-supplied headers.
- `iss` exactly equals the configured Auth issuer for that environment. For a
  hosted project the usual value is `https://<project-ref>.supabase.co/auth/v1`;
  confirm the actual emitted value before rollout. A custom-domain transition
  needs an explicit, time-bounded list of approved issuers, not a wildcard.
- A **present, nonempty** `aud`: either `authenticated`, or a string array that
  contains `authenticated`. Missing, null, empty and mismatched audiences reject.
- `role=authenticated`, a valid user UUID subject and valid time claims, with
  at most the reviewed 30-second skew. Keep normal RLS/RPC authorization after
  token validation; passing JWT validation does not grant group membership.

Supabase documents its issuer/role claims and signing keys:
[JWTs](https://supabase.com/docs/guides/auth/jwts),
[signing-key discovery/rotation](https://supabase.com/docs/guides/auth/signing-keys).
Pin the environment's trusted discovery endpoint; do not take it from the token.

Public API keys/anonymous access are not signed-in user identities. Sign-up,
password grant, refresh grant, confirmation and recovery must retain their
documented public Auth flows and abuse limits. They must not require an
unexpired user access token. Anonymous roles still cannot invoke shared RPCs
or obtain group previews/rows. Service/admin credentials stay on a separate
trusted server plane and never enter a desktop build or user-data route.

Logout must revoke the refresh session. Do not promise immediate revocation of
all already issued access tokens unless an additional server session check is
specified and tested; expiry/refresh behavior remains part of verification.

## Deployment-side enforcement

For the Data API, propose `PGRST_JWT_AUD=authenticated` plus a reviewed server
pre-request guard for mandatory audience presence/type and exact issuer for
user-role requests. This guard consumes **server-verified** JWT claims after
signature validation, before tables/views/RPC execution. It must not accept
claims or a user ID directly from a client header/body. Preserve the separate
anonymous and internal service-role contracts above.

The extra guard matters: PostgREST's configured audience check still allows a
missing, null or empty-array audience. `PGRST_JWT_AUD` alone also does not
establish exact issuer enforcement. PostgREST documents both its audience rules
and server pre-request validation:
[authentication/custom validation](https://docs.postgrest.org/en/stable/references/auth.html),
[configuration](https://docs.postgrest.org/en/stable/references/configuration.html#jwt-aud).
Any guard DDL would require a separate reviewed, re-runnable migration and SQL
tests; this proposal adds none.

The Auth service's protected bearer endpoints (such as `/auth/v1/user`) need
equivalent issuer/audience verification at the origin or at a mandatory server
gateway. Configuring the issuer of _new_ tokens is not proof that the verifier
rejects a different issuer. Likewise, the observed Auth behavior cannot be
inferred from PostgREST's settings.

Two deployment choices require owner selection and infrastructure confirmation:

1. **Private service origins with a mandatory verifying gateway:** both Auth and
   PostgREST origins are inaccessible directly from untrusted networks. The
   gateway uses a maintained server JWT verifier with the pinned issuer,
   audience and algorithm policy above on user-bearer routes. Public Auth grants
   and trusted administration have explicit separate routing/auth rules. Keep
   Data API enforcement as defense in depth.
2. **Provider-supported origin enforcement:** establish that the managed provider
   supports and actually enforces the required claims on every relevant origin.
   Use the Data API guard where supported and obtain a supported Auth-side
   enforcement mechanism. Its existence has **not** been established here.

A proxy in front of an otherwise reachable permissive hosted URL does not close
the gate: callers could use that URL directly. If managed Auth cannot supply the
contract and its origin cannot be isolated, either choose suitable infrastructure
or explicitly review a different acceptance contract. Do not silently waive the
gate or replace it with validation in React, Tauri or the SDK.

## Verification before approval

Use a fresh disposable/staging project with the proposed deployment topology;
do not apply this experiment to live Supabase. Retain a red baseline and then
test the actual enforcing boundary with both SDK and raw HTTP requests.

| Cases                                                                    | Required evidence                                                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Genuine issued user token                                                | Auth user endpoint, Data API and allowed RPCs succeed; subject/group isolation still holds.                                    |
| Same-signer control                                                      | Valid issuer/audience/time claims succeed before changing one claim at a time.                                                 |
| Wrong/missing/null issuer; near-match issuer                             | Reject at every user-bearer boundary, including direct-origin attempts.                                                        |
| Wrong/missing/null/empty audience; wrong array; malformed audience type  | Reject; valid audience string and permitted array succeed.                                                                     |
| Altered/unsigned/wrong-project key; disallowed algorithm or key ID       | Reject without adopting token-provided trust information.                                                                      |
| Expired/future-time tokens and exact skew cutoffs                        | Reject/accept at documented boundaries, on server time.                                                                        |
| Sign-in, confirmation, recovery, expired-token refresh, rotation, logout | Public grants work correctly; refresh rotates; logout's refresh token rejects.                                                 |
| Anonymous and user/service role separation                               | No shared preview/data/RPC access for anonymous callers; no user-route privilege escalation.                                   |
| Rejected mutation                                                        | Explicit HTTP/code assertion plus authoritative row read proving no write occurred.                                            |
| Gateway bypass and key rotation                                          | Direct origins cannot bypass policy; approved key transitions work and revoked trust ceases within the documented cache bound. |

Capture redacted status/code/row-count evidence and the effective server policy,
not tokens, passwords or signing material. Test every public route and any
reachable origin, rather than only the desktop's configured base URL. Keep
signing-key negative probes strictly inside disposable infrastructure. Baseline
Vitest/SQL tests and client-side rejection do not establish these properties.

**Open decision:** owner-selected deployment/enforcement topology and its real
staging verification. This document proposes a contract, not a completed gate.
