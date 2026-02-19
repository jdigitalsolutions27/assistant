# J-Digital AI Lead Assistant (JALA)

Production-ready internal app for J-Digital Solutions to discover, score, and convert leads with strict human-in-the-loop outreach.

## Compliance Boundaries

- No automated Facebook login
- No automated DM sending
- No private-data scraping
- No simulated human behavior
- Manual flow only: open Page URL, copy draft, send manually in Meta tools

## Stack (Cost-Optimized)

- Next.js 16 (App Router) + TypeScript strict
- TailwindCSS + shadcn-style components
- Postgres (Neon recommended) + Drizzle ORM
- OpenAI Responses API
- Zod validation
- Vercel-ready + Dockerfile

## Core Modules

- Prospecting pack (categories, keywords, locations, saved configs, niche recommendations)
- Lead ingestion (Google Places, CSV mapping/import, manual add)
- Scoring (heuristics + AI + weighted total)
- Outreach message generation (A/B/C variants)
- Manual outreach queue with status pipeline and event logs
- Analytics (KPIs, breakdowns, A/B variant recommendation)
- Settings/templates (categories, locations, keywords, weights, templates)

## Routes

- `/login`
- `/dashboard`
- `/dashboard/prospecting`
- `/dashboard/leads`
- `/dashboard/leads/[id]`
- `/dashboard/templates`
- `/dashboard/analytics`
- `/dashboard/settings`

## Environment Variables

Copy:

```bash
cp .env.example .env.local
```

Required:

- `DATABASE_URL`
- `ADMIN_PASSWORD`

Recommended:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-4.1-mini`)
- `GOOGLE_PLACES_API_KEY` (for Google Places ingestion)

## Database Setup

Run migration + seed:

```bash
npm run db:setup
```

Or separately:

```bash
npm run db:migrate
npm run db:seed
```

## Local Run

```bash
npm install
npm run dev
```

## Quality Checks

```bash
npm run lint
npm run build
```

## Smooth Live Deployment (Recommended)

1. Create a Neon Postgres database (free tier works).
2. Copy Neon connection string into `DATABASE_URL`.
3. Deploy this repo to Vercel.
4. Add env vars in Vercel:
   - `DATABASE_URL`
   - `ADMIN_PASSWORD`
   - `OPENAI_API_KEY` (optional but recommended)
   - `OPENAI_MODEL` (optional)
   - `GOOGLE_PLACES_API_KEY` (optional)
5. After first deploy, run:
   - `npm run db:setup`
6. Verify:
   - Login works
   - Dashboard loads
   - Manual add + CSV import
   - Lead scoring
   - Message generation
   - Manual queue events/status updates

## Docker (Optional)

```bash
docker build -t jala .
docker run -p 3000:3000 --env-file .env.local jala
```

## Notes

- API routes are explicitly `nodejs` runtime for Postgres compatibility.
- Connection settings are tuned for serverless stability (`prepare: false`, low max connections).
- Keep credentials out of logs and commits.
