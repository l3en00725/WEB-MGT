# Dependency security remediation

Repository `l3en00725/WEB-MGT`, base `claude/scaffold-siteops-mvp-tNeGY`. Draft review candidate.

## Change

Migrates the SiteOps template from Next14 to supported patched Next15.5.28/React19.3.1, preserving its npm authority and compatible SDK resolutions. The owning Inngest package remains3.54.2; its telemetry0.82.0 resolution stays within the declared >=0.66 <1.0 range.

The server Supabase helper now awaits Next15 cookies and every caller awaits the helper. Cookie forwarding preserves all options and the read-only write catch. Existing server-only external packages use the supported top-level Next15 setting. Auth checks, tenant filters and provider interfaces are preserved.

## Verification

- Actual clean frozen npm ci --ignore-scripts --no-audit --no-fund PASS on official Node24.22.1.
- Full application TypeScript, portable actual-source async cookie security fixture, offline Inngest function creation and production Next build PASS.
- Actual local production HTTP login/signup HTML and signed-out sites/API denial/redirect assertions PASS; no live Supabase/provider credentials.
- Scoped parser6.1.2→7.1.7 override: unchanged real input/config/full application content yields byte-identical27036-byte Tailwind/PostCSS CSS, SHA25696c41543110d629e547dd3ac50dbd4aa32c2db01c5dccbd08b86b9d28d8312a6. The existing PostCSS config uses Tailwind only.
- Lint not configured/not run: original next lint script has no ESLint dependency, repository config or inherited config. Establish a repository-approved lint configuration/toolchain before treating it as a required check; no policy was invented to manufacture a pass.

## Public advisory matching

Raw lock/package/version/advisory rows: `{'CRITICAL': 5, 'HIGH': 69, 'MODERATE': 82, 'LOW': 10, 'UNKNOWN': 0} → {'CRITICAL': 0, 'HIGH': 1, 'MODERATE': 0, 'LOW': 0, 'UNKNOWN': 0}`. Source: public npm OSV export retrieved2026-10-22T06:32:22.920785+00:00, SHA256 `52a54f5afaa6689b58c9ae664ec591dea6e13ea63f5662cb99ee5ea9d01faa97`. Matching was local; no private dependency inventory was uploaded.

One raw HIGH remains: build-time braces3.0.3, GHSA-vfj7-8cjw-p6xm, with no published fixed release. The inspected path is Tailwind build/config processing rather than a runtime request handler; retain the match and keep build patterns/config trusted.

- [GHSA-vfj7-8cjw-p6xm](https://nvd.nist.gov/vuln/detail/CVE-2026-93687) — braces@3.0.3 (HIGH)

## Release prerequisites

Before release, verify actual host Node patch, signed-in/admin/tenant denial flows and provider integrations with isolated staging credentials. Existing unconfigured lint remains explicit. No live database/provider requests, production state changes, merge or deployment occurred.

Rollback: revert candidate source/manifests/locks together and rebuild the prior known-good artifact. No database migration or production data change is included.
