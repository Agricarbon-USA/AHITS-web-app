# AHITS — Changelog

One line per change that reaches staging (D16: merging to `development` is the deploy): date · PR · outcome · revision.

- 2026-10-26 · docs · STATUS §4 merge checklist now carries the D48 amendment (two merges per window) · no deploy change
- 2026-10-26 · docs · D48 amended: up to two merges per window when they touch different areas, each deployed and smoked before the next; a service-worker change or migration merges alone · no deploy change
- 2026-10-26 · #272 · Security: Next.js 16.4.3 and @sentry/nextjs 10.76.2, image optimizer off (`/_next/image` returns 404). npm audit criticals 2 → 0 · `ahits-web-app-staging-00455-rmj`
- 2026-10-26 · #273 · CI tests use the runner's own PostgreSQL 16 and download no image (ends the ECR "Data limit exceeded" flake) · `ahits-web-app-staging-00454-rnb`
- 2026-10-26 · #270 · Signal returning no longer reloads the app. Screens re-read instead, and the offline page reloads itself · `ahits-web-app-staging-00452-p2h`
- 2026-10-22 · #268 · Vehicle details stop sending checkers' account records (checker is `{ id, name }` only) · `ahits-web-app-staging-00450-hvm`
