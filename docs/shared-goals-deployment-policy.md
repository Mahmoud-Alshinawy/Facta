# Accepted risk: access-token audience and issuer

**Decision (28 October 2026): the owner accepts this risk.** No gateway, no
deployment policy and no client-side workaround. Replaces the earlier
gateway/policy proposal.

## The gap

On the disposable local stack, a token signed with that stack's own key but
carrying a wrong `aud` (`another-application`) or a wrong `iss`
(`https://invalid.example.test/auth/v1`) is accepted: Auth `/auth/v1/user`
returns 200 and PostgREST returns 200. PostgREST has no `PGRST_JWT_AUD` set and
neither service checks the issuer by default. Altered, unsigned, expired and
future-`nbf` tokens are rejected (Auth 403 / PostgREST 401).

## Why the risk is low

- Exploiting it needs a token signed with the project's own signing key.
  Anyone holding that key can already mint a valid `authenticated` token, so a
  wrong audience or issuer gives them nothing extra.
- Hosted Supabase Auth only issues tokens with this project's issuer and
  audience `authenticated`. There is no second application or issuer sharing
  the key whose tokens could be replayed here.
- The live project already signs with an asymmetric ECC P-256 key, which
  clients cannot use to sign. The legacy HS256 secret is kept only for
  verification until the app moves to a publishable key (see HANDOFF.md).
- Group access never relies on these claims: RLS and the shared RPCs check
  `auth.uid()` membership on every request.

## What would change the decision

- The signing key (or the legacy HS256 secret) is shared with, or leaks to,
  another service or project.
- A second application, custom domain or third-party identity provider starts
  issuing tokens trusted by this project.
- The legacy HS256 secret stays in use long-term instead of being revoked.
- Supabase offers supported audience/issuer enforcement; then turn it on and
  make the two probes required again.

## Acceptance suite

`node scripts/run-supabase-acceptance.mjs` still sends both probes and records
them under `acceptedGaps` in `http-result.json`, with each service's status and
`stillAccepted`. They no longer fail the run. The valid-claims control and the
altered/unsigned/expired/future-`nbf` rejections remain required assertions.
