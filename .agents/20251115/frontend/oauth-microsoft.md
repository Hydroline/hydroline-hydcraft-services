# TODO – Microsoft OAuth Integration Frontend

- [ ] **Routing/Menu**: Add `OAuth` admin sidebar section matching existing design with child routes for Providers, Accounts, Logs, and Stats.
- [ ] **Stores/Composables**: Introduce Pinia store or composables to call new admin APIs (providers CRUD, accounts, logs, stats) with loading/error states and permission guards.
- [ ] **Provider Management Page**: Implement CRUD UI (table + form drawer/dialog) for providers, including Microsoft defaults, secret masking, toggle switches, and sync with backend.
- [ ] **Accounts Page**: Display account binding records (filters by provider/user/email, pagination) and allow force-detach actions with confirmation + toast feedback.
- [ ] **Logs Page**: Timeline/table of OAuth log entries with filters (provider, action, result, date range) and details drawer for metadata/IP info.
- [ ] **Stats Page**: Charts/kpis summarizing login/binding counts per provider/day; reuse existing chart components (echarts) consistent with admin style.
- [ ] **Auth Dialog**: Add provider icon buttons (Microsoft initially) using feature flags, handle redirect/callback states, and show proper error handling.
- [ ] **Callback View**: Create view/route for handling OAuth callback (reads code/state, calls API, shows spinner/toast, redirects).
- [ ] **Profile/Biding UX**: Surface linked Microsoft account info in user profile (similar to AuthMe) with bind/unbind actions gated by feature flags.
- [ ] **Visual Assets**: Add Microsoft icon/SVG asset and ensure consistent usage in AuthDialog + admin tables.
