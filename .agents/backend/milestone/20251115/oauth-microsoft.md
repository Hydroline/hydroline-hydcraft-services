# TODO – Microsoft OAuth Integration Backend

- [ ] **Schema**: Extend `prisma/schema.prisma` with `OAuthProvider`, `OAuthLog`, and optional summary tables (counts per provider/day) plus corresponding Prisma migrations.
- [ ] **Config**: Add strongly typed config entries + `.env.sample` keys for Microsoft tenant/client IDs, secret, redirect URL, scopes, and enable flags; inject via `ConfigService`.
- [ ] **Better Auth**: Register Microsoft provider in `src/lib/shared/auth.ts`, ensuring secrets flow from config/env, tokens persisted in `accounts`, and feature flags toggle availability.
- [ ] **Auth Service**: Update DTOs + `AuthService` to handle `MICROSOFT` mode for login/register, plus API endpoints for initiating OAuth redirects and handling callbacks (login + binding flows).
- [ ] **Binding APIs**: Introduce controller/service endpoints for Microsoft binding/unbinding (similar to AuthMe) that reuse OAuth provider definitions, persist `accounts` rows, and log lifecycle events.
- [ ] **Admin APIs**: Build `/admin/oauth/providers`, `/admin/oauth/accounts`, `/admin/oauth/logs`, `/admin/oauth/stats` endpoints (pagination, filtering) with guards + permissions.
- [ ] **Logging**: On every OAuth action (auth attempt, success, failure, binding, unbinding) write `OAuthLog` entries capturing provider, user, action, IP, UA, metadata.
- [ ] **Statistics**: Provide aggregated stats (per provider totals, daily counts, success/failure ratios) for the frontend chart.
- [ ] **Feature Flags**: Extend `/auth/features` payloads to include provider availability + binding toggles consumed by the frontend.
- [ ] **Docs**: Document new env vars + Microsoft Entra portal setup in README / ops docs once implementation completes.
