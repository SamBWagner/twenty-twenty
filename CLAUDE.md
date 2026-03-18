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
npm run db:generate  # Generate Drizzle migration
npm run db:migrate   # Run Drizzle migration
```

## Auth

Uses better-auth with GitHub OAuth. Tables (`user`, `session`, `account`, `verification`) are managed by better-auth. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env`.

## Database

SQLite at `packages/api/data/twenty-twenty.db`. Schema in `packages/api/src/db/schema.ts`. Renamed from `sessions` to `retro_sessions` to avoid collision with better-auth's `session` table.
