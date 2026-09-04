# SaaSElephant V1

SaaSElephant is evolving from a static software-directory prototype into a user-first
software discovery, comparison, and affiliate platform.

The original static prototype remains preserved at the repository root in `index.html`
and in Git history. The Next.js application introduced in Phase 1 is intentionally a
small foundation; it does not read from or write to Supabase yet.

## Requirements

- Node.js 22 or newer
- pnpm 10 or newer

## Local development

1. Copy `.env.example` to `.env.local`.
2. Populate only the public Supabase variables when a future route needs them. Do not
   commit `.env.local`.
3. Install dependencies with `pnpm install`.
4. Start the application with `pnpm dev`.

The starter routes are available at `/`, `/software`, `/admin`, and `/api/health`.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`: public Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: browser-safe Supabase publishable key.
- `SUPABASE_SERVICE_ROLE_KEY`: reserved for future server-only operations. It is not
  required by this phase and must never be exposed to the browser.

## Quality checks

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format
```

GitHub Actions runs installation, type-checking, linting, production build, and tests
for pull requests and pushes to `main` and `v1-platform`.

## Architecture boundaries

- `app/(public)`: public discovery routes.
- `app/admin`: future protected editorial routes.
- `app/api`: server-only HTTP endpoints, beginning with health monitoring.
- `src/lib/supabase/client.ts`: browser-safe Supabase client factory.
- `src/lib/supabase/server.ts`: server-only configuration boundary for future privileged
  work.
- Future schema migrations will live under `supabase/migrations`; Phase 1 makes no
  database connection or change.
