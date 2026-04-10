# Nauti Sonar

Article prospecting, contact discovery, and outreach management platform by Nautilus Marketing.

**Live URL:** https://sonar.nautilusmarketing.digital

## Features

- **Source Management** — Track publications with configurable crawl methods (RSS, Sitemap, Archive, CSS Selector, Custom Parser)
- **Article Scraping** — Automated crawling with metadata enrichment and outbound link extraction
- **Website Email Scraper** — Second-pass scrape of company websites found in articles for email discovery
- **Contact Discovery** — Intelligent email and contact page scanning across article pages, author profiles, and site contact pages
- **Lead Detection** — Automatic extraction of LinkedIn profiles, Twitter/X handles, company URLs, and emails
- **Auto-Archive** — Articles with no leads are automatically archived
- **Article Pipeline** — Full workflow: New → Reviewing → Ready → Sent → Completed → Archived
- **Outreach Queue** — Prepare and track outreach per article/contact/campaign
- **Campaigns** — Group articles and contacts for organized outreach efforts
- **Contact Database** — Manage journalist, editor, and PR contacts
- **CSV Export** — Export filtered article data for external use
- **Dashboard** — KPI cards, charts, pipeline status, contact discovery coverage
- **Login** — Session-based authentication with multi-user support
- **Dark Mode** — Full dark mode support

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Radix UI
- **Backend**: Next.js API routes
- **Database**: MySQL/MariaDB with Prisma ORM
- **Auth**: JWT sessions (jose)
- **Scraping**: Cheerio (HTML parsing), custom parser architecture
- **Charts**: Recharts

## Prerequisites

- Node.js 20+
- MySQL 8+ or MariaDB 10.5+

---

## Deployment to Plesk (sonar.nautilusmarketing.digital)

### 1. Create the Subdomain in Plesk

- Go to **Websites & Domains** → **Add Subdomain**
- Subdomain: `sonar.nautilusmarketing.digital`

### 2. Enable Node.js

- Click on the subdomain → **Node.js** (under Dev Tools)
- **Node.js version**: 20+
- **Application Root**: `/sonar.nautilusmarketing.digital`
- **Application Startup File**: `node_modules/next/dist/bin/next`
- **Application Mode**: `production`
- Click **Enable Node.js**

### 3. Upload Files

Upload all project files to the subdomain's document root via Plesk File Manager or SFTP. A ready-made zip is at `~/Desktop/nauti-sonar.zip`.

**Do NOT upload**: `node_modules/`, `.next/`, `src/generated/`, `.git/`, `.env`

### 4. Create the `.env` File

In the document root, create `.env`:

```env
DATABASE_URL="mysql://DB_USER:DB_PASSWORD@localhost:3306/nauti_sonar"
AUTH_SECRET="GENERATE_A_RANDOM_STRING"
AUTH_USERS="admin:NautiSonar2024!,Bruce:Bruce2026!"
```

Replace `DB_USER` and `DB_PASSWORD` with your Plesk PostgreSQL credentials.

### 5. Set Up the Database

- In Plesk → **Databases** → **Add Database**
- Type: **MySQL** (MariaDB)
- Database name: `nauti_sonar`
- Create a database user and note the credentials
- Update the `DATABASE_URL` in `.env` with these credentials

### 6. Install & Build

Via Plesk SSH terminal or the Node.js **Run Script** feature:

```bash
npm install
npx prisma generate
npx prisma db push
npm run build
```

### 7. Restart the App

Click **Restart App** in the Plesk Node.js panel.

The app should now be live at **https://sonar.nautilusmarketing.digital**

### 8. SSL Certificate

If not already set up, go to **SSL/TLS Certificates** for the subdomain and issue a free Let's Encrypt certificate.

---

## Login Credentials

| Username | Password |
|---|---|
| `admin` | `NautiSonar2024!` |
| `Bruce` | `Bruce2026!` |

To add more users, edit `AUTH_USERS` in `.env` (format: `user1:pass1,user2:pass2`) and restart the app.

---

## Local Development

```bash
npm install
cp .env.example .env   # edit with your local DB credentials
npm run setup           # generate client, push schema
npm run dev             # http://localhost:3000
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run setup` | Generate Prisma client, push schema, and seed |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to database |
| `npm run db:studio` | Open Prisma Studio |

## Project Structure

```
src/
├── app/
│   ├── (app)/                      # Authenticated pages (wrapped in Shell)
│   │   ├── page.tsx                # Dashboard
│   │   ├── articles/page.tsx       # Article pipeline table
│   │   ├── sources/page.tsx        # Source management
│   │   ├── campaigns/page.tsx      # Campaign management
│   │   ├── contacts/page.tsx       # Contact database
│   │   ├── outreach/page.tsx       # Outreach queue
│   │   ├── logs/page.tsx           # Logs & audit trail
│   │   └── settings/page.tsx       # Settings
│   ├── login/page.tsx              # Login screen
│   └── api/                        # API routes
│       ├── auth/                   # Login/logout
│       ├── articles/               # Article CRUD, bulk, export, rescrape, website scrape
│       ├── sources/                # Source CRUD, crawl trigger
│       ├── campaigns/              # Campaign CRUD
│       ├── contacts/               # Contact CRUD
│       ├── contact-discovery/      # Bulk contact discovery
│       ├── outreach/               # Outreach item CRUD
│       ├── metrics/                # Dashboard metrics
│       ├── logs/                   # Logs API
│       └── users/                  # Users API
├── components/
│   ├── ui/                         # Radix UI primitives
│   ├── layout/                     # Shell, sidebar, header
│   ├── dashboard/                  # Article detail drawer
│   └── shared/                     # StatusBadge, MetricCard, loading states
├── services/
│   ├── crawler/                    # Crawl engine, article metadata, website email scraper
│   ├── contact-discovery/          # Email scanner, discovery engine
│   ├── parsers/                    # RSS, Sitemap, Archive, Selector, CEO Times parsers
│   └── export/                     # CSV export
├── lib/                            # DB client, auth, utilities, constants
├── proxy.ts                        # Auth middleware (protects all routes)
└── types/                          # TypeScript types
```
