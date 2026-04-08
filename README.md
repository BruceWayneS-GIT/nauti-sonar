# PR Outreach Pipeline

Internal web application for PR article prospecting, contact discovery, and outreach management.

## Features

- **Source Management** — CRUD for tracked publications with configurable crawl methods (RSS, Sitemap, Archive, CSS Selector, Custom Parser)
- **Article Scraping** — Automated crawling and deduplication with metadata enrichment
- **Contact Discovery** — Intelligent email and contact page scanning across article pages, author profiles, and site contact pages
- **Article Pipeline** — Full workflow from New -> Reviewing -> Ready -> Sent -> Completed -> Archived
- **Outreach Queue** — Prepare and track outreach per article/contact/campaign
- **Campaigns** — Group articles and contacts for organized outreach efforts
- **Contact Database** — Manage journalist, editor, and PR contacts
- **CSV Export** — Export filtered article data for external use
- **Dashboard** — KPI cards, charts, pipeline status, contact discovery coverage
- **Logs & Audit** — Crawl history, parser errors, contact discovery runs, status change audit trail
- **Dark Mode** — Full dark mode support

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Radix UI
- **Backend**: Next.js API routes
- **Database**: PostgreSQL with Prisma ORM
- **Scraping**: Cheerio (HTML parsing), custom parser architecture
- **Charts**: Recharts
- **Styling**: Nautilus-inspired design (deep navy, teal accent, soft blue-gray)

## Prerequisites

- Node.js 18+
- PostgreSQL 14+

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure database

Edit `.env` with your PostgreSQL connection string:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pr_outreach?schema=public"
```

Create the database if it doesn't exist:

```bash
createdb pr_outreach
```

### 3. Run setup (generate client, push schema, seed data)

```bash
npm run setup
```

This runs:
- `prisma generate` — generates the Prisma client
- `prisma db push` — pushes the schema to the database
- `tsx prisma/seed.ts` — seeds realistic sample data

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run setup` | Generate Prisma client, push schema, and seed |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to database |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed the database |
| `npm run db:reset` | Reset database and re-seed |
| `npm run db:studio` | Open Prisma Studio |

## Project Structure

```
src/
├── app/                          # Next.js App Router pages
│   ├── page.tsx                  # Dashboard
│   ├── articles/page.tsx         # Article pipeline table
│   ├── sources/page.tsx          # Source management
│   ├── campaigns/page.tsx        # Campaign management
│   ├── contacts/page.tsx         # Contact database
│   ├── outreach/page.tsx         # Outreach queue
│   ├── logs/page.tsx             # Logs & audit trail
│   ├── settings/page.tsx         # Settings
│   └── api/                      # API routes
│       ├── articles/             # Article CRUD, bulk, export, contact discovery
│       ├── sources/              # Source CRUD, crawl trigger
│       ├── campaigns/            # Campaign CRUD
│       ├── contacts/             # Contact CRUD
│       ├── outreach/             # Outreach item CRUD
│       ├── metrics/              # Dashboard metrics
│       ├── logs/                 # Logs API
│       └── users/                # Users API
├── components/
│   ├── ui/                       # Radix UI primitives (button, badge, dialog, etc.)
│   ├── layout/                   # Shell, sidebar, header
│   ├── dashboard/                # Article detail drawer
│   └── shared/                   # StatusBadge, MetricCard, loading states
├── services/
│   ├── crawler/                  # Crawl engine, article metadata extraction
│   ├── contact-discovery/        # Email scanner, discovery engine
│   ├── parsers/                  # Base parser + RSS, Sitemap, Archive, Selector, CEO Times
│   └── export/                   # CSV export
├── lib/                          # DB client, utilities, constants
└── types/                        # TypeScript types
prisma/
├── schema.prisma                 # Database schema (12 models)
└── seed.ts                       # Seed script with realistic data
```

## Parser Architecture

Each source can use a different parser strategy:

- **RSS** — Parses RSS/Atom feeds
- **Sitemap** — Parses XML sitemaps (including sitemap indexes)
- **Archive Pages** — Crawls paginated archive/category pages
- **CSS Selector** — Uses configurable CSS selectors to extract articles
- **Custom Parser** — Site-specific parser (e.g., `ceotimes-parser.ts`)

To add a new custom parser:
1. Create a file in `src/services/parsers/` extending `BaseParser`
2. Register it in `src/services/parsers/index.ts` in the `CUSTOM_PARSERS` map

## Contact Discovery

For each article, the contact discovery engine:

1. Scans the article page for mailto links, visible emails, author bios
2. Follows author profile pages found on the article
3. Follows contact-related pages (/contact, /about, /team, /editorial, etc.)
4. Falls back to common contact paths on the domain
5. Classifies each found email (personal, editorial, generic)
6. Assigns confidence levels (HIGH, MEDIUM, LOW, MINIMAL, NONE)
7. Saves all findings with provenance (URL where found, context, snippet)
8. Updates the article with the best contact for quick display

## Data Models

- **User** — Team members for assignment and audit
- **Source** — Tracked publications with crawl config
- **CrawlJob** — Crawl execution records
- **CrawlLog** — Per-crawl log entries
- **Article** — Scraped articles with workflow status and contact info
- **ArticleStatusHistory** — Audit trail for status changes
- **ContactDiscoveryRun** — Contact discovery execution records
- **ContactFinding** — Individual discovered contacts with provenance
- **Campaign** — Outreach campaign groupings
- **Contact** — Journalist/editor contact database
- **CampaignContact** — Many-to-many campaign-contact link
- **OutreachItem** — Individual outreach actions per article

## Seeded Data

The seed script creates:
- 4 team members
- 15 publication sources (including CEO Times as primary)
- 3 campaigns
- 6 journalist/editor contacts
- ~30 articles across multiple sources with realistic statuses, assignments, and contact data
- Sample crawl jobs and outreach items
