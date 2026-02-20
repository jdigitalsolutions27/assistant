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
- Lead quality scoring (`High`/`Medium`/`Low`) and quality-aware filtering
- Duplicate-safe ingestion (website/Facebook/phone/name+location fingerprinting)
- Contact freshness maintenance (reverify stale website leads and refresh Facebook/email)
- Campaign workbench (targeting, auto-assignment, follow-up cadence)
- Priority queue (top leads to contact next)
- Today Queue (single-page daily outreach workflow with quick actions)
- Today Queue follow-up autopilot (generate due follow-up drafts, then manual send)
- Campaign playbooks (launch reusable campaign presets quickly)
- Campaign funnel analytics (reply rate, win rate, avg reply hours)
- Compliance guardrails (template + generated message lint/sanitization)
- Duplicate guard checker (manual pre-check endpoint + dashboard card)
- Strategy learning by category + location

## Routes

- `/login`
- `/dashboard`
- `/dashboard/prospecting`
- `/dashboard/leads`
- `/dashboard/leads/[id]`
- `/dashboard/today`
- `/dashboard/campaigns`
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
- `MAINTENANCE_API_KEY` (optional, for cron/nightly endpoint access)
- `CRON_SECRET` (optional, if using Vercel Cron with bearer auth)

## Database Setup

Run migration + seed:

```bash
npm run db:setup
```

Or separately:

```bash
npm run db:migrate
npm run db:seed

# aliases
npm run migrate
npm run seed
npm run setup
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

## Maintenance Operations

- Reverify stale contact data from Settings:
  - `Dashboard -> Settings -> Contact Freshness -> Run Recheck`
- Generate follow-up drafts from campaigns:
  - `Dashboard -> Campaigns -> Run Follow-up`
- Run nightly maintenance via API cron:
  - `GET /api/maintenance/nightly`
  - Include `x-maintenance-key: MAINTENANCE_API_KEY` header (or use logged-in admin session)
  - For Vercel Cron, set `MAINTENANCE_API_KEY` equal to `CRON_SECRET`
- Run morning follow-up draft automation via cron:
  - `GET /api/maintenance/follow-ups`
  - Include `Authorization: Bearer CRON_SECRET` (automatic in Vercel Cron)

- Optional API endpoint (admin-auth protected):
  - `POST /api/maintenance/reverify-stale`
  - `POST /api/maintenance/follow-ups`
  - `GET /api/maintenance/follow-ups`
  - `POST /api/campaigns/assign`
  - `GET /api/maintenance/nightly`
  - `POST /api/maintenance/nightly` (admin session or `x-maintenance-key`)
  - Body:

```json
{
  "days_stale": 21,
  "limit": 60
}
```

- CSV and Google Places imports now skip duplicates and report `skipped_duplicates`.

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
   - `MAINTENANCE_API_KEY` (optional, for cron/nightly endpoint auth)
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
- Rotate any leaked API keys immediately before production deploy.
