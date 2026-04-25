# Twenty Twenty

Retrospective web application. Monorepo with npm workspaces.

## Structure

- `packages/api` - Hono API server (port 3001), SQLite via Drizzle, better-auth for GitHub OAuth
- `packages/web` - Astro frontend (port 4321) with React islands, Tailwind CSS
- `packages/shared` - Shared TypeScript types and constants

## Commands

```bash
npm run dev          # Start both API and web servers
npm run dev:api      # Start API server only
npm run dev:web      # Start Astro dev server only
npm run build        # Build shared, API, and web
npm run deploy:check # Build the Fly image locally without releasing it
npm run deploy:fly   # Deploy to Fly using the local Docker builder
npm run db:generate  # Generate Drizzle migration
npm run db:migrate   # Run Drizzle migration
```

## Auth

Uses better-auth with GitHub OAuth. Tables (`user`, `session`, `account`, `verification`) are managed by better-auth. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env`.

## Database

SQLite at `packages/api/data/twenty-twenty.db`. Schema in `packages/api/src/db/schema.ts`. Renamed from `sessions` to `retro_sessions` to avoid collision with better-auth's `session` table.

## Deployments

Production deploys to Fly.io app `twenty-twenty` in `syd` using `fly.toml`, `Dockerfile`, `Caddyfile`, and `scripts/prod-entrypoint.sh`.

Deployment path:

```bash
npm run test:unit
npm run build
npm run deploy:check
npm run deploy:fly
```

Use `npm run deploy:fly` instead of plain `fly deploy` for the default path. Plain `fly deploy` uses Fly's remote/Depot builder by default and can sit at `Waiting for depot builder...`; if that command is interrupted with Ctrl-C, Fly may print `interrupt signal received` even though the local project is fine. The local deploy script uses Docker Desktop with `fly deploy --local-only`, avoiding that remote-builder wait.

After deploy:

```bash
fly status
fly releases
fly logs --no-tail
curl -sS https://twentytwenty.dev/api/health
```

The production container runs migrations automatically on startup before launching the API, web server, and Caddy. Do not run `npm run db:migrate` against production directly; production data lives on the Fly volume mounted at `/data`.

Production secrets should be managed with `fly secrets`, not committed or added to `fly.toml`. Required secrets include `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET`.
