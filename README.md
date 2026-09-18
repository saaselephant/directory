# SaaSElephant

A Next.js software discovery directory in the Pralka Tech ecosystem. Public browsing
requires no account. Supabase provides the published catalog, categories, editorial
roles and private affiliate configuration. This is an established product, not a starter.

## Runtime and development

Node 22+ (CI: 24), pnpm 11.19.0, Next.js 16.3.3, React 19.2.3.
Use the committed lockfile: `pnpm install --frozen-lockfile`.
Copy `.env.example` to `.env.local` and set the two public Supabase variables.
`pnpm dev` starts the application. If Windows Application Control blocks native SWC,
use `pnpm dev --webpack`; do not weaken the machine's security policy.

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project endpoint.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: public API key, constrained by RLS.
- `SITE_URL`: optional canonical HTTPS origin; defaults to the existing sitemap's
  `https://saaselephant.com`. The legacy root CNAME is not deployment authority.

The runtime uses public credentials and authenticated admin sessions, never a service-role key.

## Capabilities

- `/`: search-led discovery and alphabetical six-product shelf.
- `/software`, `/categories`, and their slug routes: published catalog, filters,
  pagination, product essentials and related software.
- `/go/[slug]`: server-side eligible affiliate routing with official-site fallback.
- `/privacy`, `/terms`, `/contact`: factual public information; contact remains an
  owner decision, not a functioning enquiry form.
- `/admin`: authenticated editorial verification and publication.
- `/sitemap.xml`: paginated published software/category inventory; fails on database
  errors rather than returning a misleading partial catalog.
- `/api/health`: application liveness only, not a database readiness check.

Product Factory and Logo Factory remain operator-driven tools. The latest recorded
catalog milestone is 507 published products (September 9, 2026), not a live count.
353 local product logos are mapped by the generated manifest; other products use initials.
The original `index.html` and CNAME are legacy artifacts outside the Next application.

## Verification

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
CI runs these on pull requests and pushes to `main` and `v1-platform`.
On machines without permitted native SWC, verify with `pnpm build --webpack`.
An access-denied error resolving an installed dependency is an environment problem;
do not change dependency versions to conceal it.

See [current handoff](docs/current-state-handoff.md) for closure evidence and external decisions.
Historical checkpoint files and migration records are historical evidence, not current runtime guarantees.
