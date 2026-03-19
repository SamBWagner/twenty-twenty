# Twenty Twenty

A retrospective web app for teams. Run retro sessions with your project members — collect feedback, vote on items, bundle themes, assign actions, and hold each other accountable in the next session's review phase.

## Tech Stack

- **API** — [Hono](https://hono.dev) on Node, SQLite via [Drizzle ORM](https://orm.drizzle.team), [better-auth](https://www.better-auth.com) for GitHub OAuth
- **Web** — [Astro](https://astro.build) with React islands, Tailwind CSS
- **Shared** — TypeScript types and constants shared across packages

Monorepo managed with npm workspaces.

## Getting Started

### Prerequisites

- Node.js 20+
- A [GitHub OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app) (callback URL: `http://localhost:3001/api/auth/callback/github`)

### Setup

```bash
# Clone and install
git clone https://github.com/your-org/twenty-twenty.git
cd twenty-twenty
npm install

# Configure environment
cp .env.example .env
# Fill in GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and SESSION_SECRET

# Run database migrations
npm run db:migrate

# Start dev servers (API on :3001, Web on :4321)
npm run dev
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start API and web servers concurrently |
| `npm run dev:api` | Start API server only |
| `npm run dev:web` | Start Astro dev server only |
| `npm run build` | Build both packages for production |
| `npm run db:generate` | Generate a Drizzle migration |
| `npm run db:migrate` | Run Drizzle migrations |
| `npm run test:e2e:run` | Run end-to-end tests (requires Docker) |

## Project Structure

```
packages/
  api/       Hono API server, database schema, auth
  web/       Astro frontend with React islands
  shared/    Shared types and constants
```

## How Retros Work

1. **Review** — Review action items from the previous session. Each assignee's work is rated by the team.
2. **Ideation** — Team members submit "went well" and "didn't go well" items, then vote.
3. **Action** — Group items into bundles, create action items, and assign owners.
4. **Closed** — Session is archived and actions carry forward to the next retro's review phase.

## License

MIT
