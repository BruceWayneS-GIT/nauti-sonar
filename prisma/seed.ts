import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const url = new URL(process.env.DATABASE_URL!);
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace('/', ''),
  connectionLimit: 5,
});
const prisma = new PrismaClient({ adapter });

function hashUrl(url: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(url.toLowerCase().replace(/\/$/, '')).digest('hex').slice(0, 16);
}

async function main() {
  console.log('Seeding database...');

  // ─── Users ────────────────────────────────────────────────────────────────
  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'bruce@nautilusmarketing.digital' },
      update: {},
      create: { name: 'Bruce', email: 'bruce@nautilusmarketing.digital', role: 'admin' },
    }),
    prisma.user.upsert({
      where: { email: 'elke@nautilusmarketing.digital' },
      update: {},
      create: { name: 'Elke', email: 'elke@nautilusmarketing.digital', role: 'member' },
    }),
    prisma.user.upsert({
      where: { email: 'tom@nautilusmarketing.digital' },
      update: {},
      create: { name: 'Tom', email: 'tom@nautilusmarketing.digital', role: 'member' },
    }),
    prisma.user.upsert({
      where: { email: 'cam@nautilusmarketing.digital' },
      update: {},
      create: { name: 'Cam', email: 'cam@nautilusmarketing.digital', role: 'member' },
    }),
  ]);

  // ─── Sources ──────────────────────────────────────────────────────────────
  const sourcesData = [
    { name: 'CEO Times', rootUrl: 'https://ceotimes.com', crawlMethod: 'CUSTOM_PARSER' as const, notes: 'Primary target — C-suite focused publication' },
    { name: 'Forbes', rootUrl: 'https://www.forbes.com', crawlMethod: 'SITEMAP' as const, notes: 'Top-tier business publication' },
    { name: 'Inc.', rootUrl: 'https://www.inc.com', crawlMethod: 'RSS' as const, notes: 'Entrepreneurship and small business focus' },
    { name: 'Entrepreneur', rootUrl: 'https://www.entrepreneur.com', crawlMethod: 'SITEMAP' as const, notes: 'Startup and business growth content' },
    { name: 'TechCrunch', rootUrl: 'https://techcrunch.com', crawlMethod: 'RSS' as const, notes: 'Tech industry news and startups' },
    { name: 'Business Insider', rootUrl: 'https://www.businessinsider.com', crawlMethod: 'SITEMAP' as const, notes: 'Business and tech news' },
    { name: 'Fast Company', rootUrl: 'https://www.fastcompany.com', crawlMethod: 'SITEMAP' as const, notes: 'Innovation and business culture' },
    { name: 'Harvard Business Review', rootUrl: 'https://hbr.org', crawlMethod: 'SITEMAP' as const, notes: 'Academic business insights' },
    { name: 'The Verge', rootUrl: 'https://www.theverge.com', crawlMethod: 'RSS' as const, notes: 'Technology and culture' },
    { name: 'Wired', rootUrl: 'https://www.wired.com', crawlMethod: 'SITEMAP' as const, notes: 'Technology and science' },
    { name: 'VentureBeat', rootUrl: 'https://venturebeat.com', crawlMethod: 'RSS' as const, notes: 'AI and enterprise technology' },
    { name: 'ZDNet', rootUrl: 'https://www.zdnet.com', crawlMethod: 'SITEMAP' as const, notes: 'Enterprise technology' },
    { name: 'PR Newswire', rootUrl: 'https://www.prnewswire.com', crawlMethod: 'SITEMAP' as const, notes: 'Press release distribution' },
    { name: 'The Drum', rootUrl: 'https://www.thedrum.com', crawlMethod: 'SITEMAP' as const, notes: 'Marketing and advertising industry', status: 'PAUSED' as const },
    { name: 'Marketing Week', rootUrl: 'https://www.marketingweek.com', crawlMethod: 'SITEMAP' as const, notes: 'UK marketing industry' },
  ];

  const sources = [];
  for (const s of sourcesData) {
    const source = await prisma.source.upsert({
      where: { rootUrl: s.rootUrl },
      update: {},
      create: {
        name: s.name,
        rootUrl: s.rootUrl,
        crawlMethod: s.crawlMethod,
        crawlFrequency: 60,
        status: ((s as Record<string, unknown>).status as 'ACTIVE' | 'PAUSED' | 'ERROR') || 'ACTIVE',
        notes: s.notes,
        lastCrawledAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      },
    });
    sources.push(source);
  }

  // ─── Campaigns ────────────────────────────────────────────────────────────
  const campaigns = await Promise.all([
    prisma.campaign.create({
      data: { name: 'Q2 2026 Tech PR', description: 'Outreach to tech publications for product launch coverage', status: 'active', startDate: new Date('2026-04-01'), endDate: new Date('2026-06-30') },
    }),
    prisma.campaign.create({
      data: { name: 'CEO Thought Leadership', description: 'Place opinion and insight pieces with business media', status: 'active', startDate: new Date('2026-03-15') },
    }),
    prisma.campaign.create({
      data: { name: 'Startup Feature Series', description: 'Get featured in startup and entrepreneurship publications', status: 'draft' },
    }),
  ]);

  // ─── Contacts ─────────────────────────────────────────────────────────────
  const contacts = await Promise.all([
    prisma.contact.create({ data: { name: 'Rachel Kim', email: 'rachel.kim@ceotimes.com', title: 'Senior Editor', publication: 'CEO Times' } }),
    prisma.contact.create({ data: { name: 'Marcus Webb', email: 'mwebb@forbes.com', title: 'Staff Writer', publication: 'Forbes' } }),
    prisma.contact.create({ data: { name: 'Priya Sharma', email: 'priya@techcrunch.com', title: 'Reporter', publication: 'TechCrunch' } }),
    prisma.contact.create({ data: { name: 'David Chen', email: 'dchen@inc.com', title: 'Contributing Editor', publication: 'Inc.' } }),
    prisma.contact.create({ data: { name: 'Olivia Hart', email: 'olivia.hart@fastcompany.com', title: 'Deputy Editor', publication: 'Fast Company' } }),
    prisma.contact.create({ data: { name: 'Tom Sullivan', email: 'tsullivan@venturebeat.com', title: 'AI Reporter', publication: 'VentureBeat' } }),
  ]);

  // ─── Articles ─────────────────────────────────────────────────────────────
  const articleSets = [
    // CEO Times articles
    ...generateArticles(sources[0].id, 'CEO Times', 'ceotimes.com', [
      { title: 'How AI Is Reshaping the Modern C-Suite', author: 'Rachel Kim', category: 'Leadership', email: 'rachel.kim@ceotimes.com', confidence: 'HIGH' as const, contactType: 'DIRECT_AUTHOR' as const },
      { title: 'The Rise of Fractional Executives in Startups', author: 'Michael Torres', category: 'Management', email: 'editorial@ceotimes.com', confidence: 'LOW' as const, contactType: 'EDITORIAL' as const },
      { title: 'Why CEOs Need to Embrace Remote-First Culture', author: 'Sophie Lane', category: 'Culture' },
      { title: 'Board Diversity and Company Performance: The Latest Research', author: 'Rachel Kim', category: 'Governance', email: 'rachel.kim@ceotimes.com', confidence: 'HIGH' as const, contactType: 'DIRECT_AUTHOR' as const },
      { title: 'Five Lessons from the Most Resilient Companies of 2026', author: null, category: 'Strategy', contactUrl: 'https://ceotimes.com/contact', confidence: 'MINIMAL' as const, contactType: 'CONTACT_PAGE_ONLY' as const },
      { title: 'The CEO\'s Guide to Navigating Geopolitical Uncertainty', author: 'David Park', category: 'Strategy' },
      { title: 'Executive Burnout: A Growing Crisis in Corporate Leadership', author: 'Maria Costa', category: 'Wellbeing', email: 'maria@ceotimes.com', confidence: 'MEDIUM' as const, contactType: 'DIRECT_AUTHOR' as const },
      { title: 'How to Build a Culture of Innovation From the Top Down', author: 'James Whitfield', category: 'Innovation' },
    ]),
    // Forbes articles
    ...generateArticles(sources[1].id, 'Forbes', 'forbes.com', [
      { title: 'The World\'s Most Innovative Companies 2026', author: 'Marcus Webb', category: 'Innovation', email: 'mwebb@forbes.com', confidence: 'HIGH' as const, contactType: 'DIRECT_AUTHOR' as const },
      { title: 'Billionaire CEOs Bet Big on AI Infrastructure', author: 'Lisa Chang', category: 'Technology', email: 'lchang@forbes.com', confidence: 'HIGH' as const, contactType: 'DIRECT_AUTHOR' as const },
      { title: 'Why the IPO Market Is Heating Up Again', author: 'Ryan Brooks', category: 'Finance' },
      { title: 'The Future of Work: Predictions from 10 Top CEOs', author: 'Marcus Webb', category: 'Leadership', email: 'mwebb@forbes.com', confidence: 'HIGH' as const, contactType: 'DIRECT_AUTHOR' as const },
      { title: 'Sustainable Business Models That Actually Work', author: 'Anna Kim', category: 'Sustainability' },
    ]),
    // TechCrunch articles
    ...generateArticles(sources[4].id, 'TechCrunch', 'techcrunch.com', [
      { title: 'Startup Raises $50M to Revolutionize Enterprise AI', author: 'Priya Sharma', category: 'Startups', email: 'priya@techcrunch.com', confidence: 'HIGH' as const, contactType: 'DIRECT_AUTHOR' as const },
      { title: 'The AI Agent Wars: Who Will Win the Enterprise Market', author: 'Nathan Cole', category: 'AI', contactUrl: 'https://techcrunch.com/contact', confidence: 'MINIMAL' as const, contactType: 'CONTACT_PAGE_ONLY' as const },
      { title: 'YC Demo Day: The 10 Startups to Watch', author: 'Priya Sharma', category: 'Startups', email: 'priya@techcrunch.com', confidence: 'HIGH' as const, contactType: 'DIRECT_AUTHOR' as const },
      { title: 'Why B2B SaaS Valuations Are Rebounding', author: 'Alex Kim', category: 'Enterprise' },
      { title: 'Open Source AI Models Are Changing the Game', author: 'Nathan Cole', category: 'AI', email: 'tips@techcrunch.com', confidence: 'LOW' as const, contactType: 'EDITORIAL' as const },
      { title: 'The Best Developer Tools of 2026 So Far', author: 'Maya Johnson', category: 'Developer' },
    ]),
    // Inc. articles
    ...generateArticles(sources[2].id, 'Inc.', 'inc.com', [
      { title: 'How This Founder Turned a Side Project Into a $100M Company', author: 'David Chen', category: 'Entrepreneurship', email: 'dchen@inc.com', confidence: 'MEDIUM' as const, contactType: 'DIRECT_AUTHOR' as const },
      { title: 'The Management Playbook Every First-Time CEO Needs', author: 'Sarah Miller', category: 'Management' },
      { title: 'Why Gen Z Workers Want More Than Just a Paycheck', author: 'David Chen', category: 'Workplace', email: 'dchen@inc.com', confidence: 'MEDIUM' as const, contactType: 'DIRECT_AUTHOR' as const },
    ]),
    // Fast Company articles
    ...generateArticles(sources[6].id, 'Fast Company', 'fastcompany.com', [
      { title: 'The Most Creative People in Business 2026', author: 'Olivia Hart', category: 'Creativity', email: 'olivia.hart@fastcompany.com', confidence: 'HIGH' as const, contactType: 'DIRECT_AUTHOR' as const },
      { title: 'Design-Led Companies Are Outperforming the Market', author: 'Ben Torres', category: 'Design', contactUrl: 'https://fastcompany.com/about', confidence: 'MINIMAL' as const, contactType: 'CONTACT_PAGE_ONLY' as const },
      { title: 'How One Brand Reinvented the Customer Experience', author: 'Olivia Hart', category: 'Innovation', email: 'olivia.hart@fastcompany.com', confidence: 'HIGH' as const, contactType: 'DIRECT_AUTHOR' as const },
    ]),
    // VentureBeat articles
    ...generateArticles(sources[10].id, 'VentureBeat', 'venturebeat.com', [
      { title: 'Enterprise AI Adoption: Where We Stand in 2026', author: 'Tom Sullivan', category: 'AI', email: 'tsullivan@venturebeat.com', confidence: 'HIGH' as const, contactType: 'DIRECT_AUTHOR' as const },
      { title: 'The Race to Build Autonomous AI Agents', author: 'Tom Sullivan', category: 'AI', email: 'tsullivan@venturebeat.com', confidence: 'HIGH' as const, contactType: 'DIRECT_AUTHOR' as const },
      { title: 'Cloud Cost Optimization: The Next Big Enterprise Challenge', author: 'Karen Lee', category: 'Cloud' },
    ]),
  ];

  const statuses = ['NEW', 'NEW', 'NEW', 'REVIEWING', 'REVIEWING', 'READY', 'READY', 'SENT', 'COMPLETED', 'ARCHIVED'] as const;

  for (let i = 0; i < articleSets.length; i++) {
    const a = articleSets[i];
    const status = statuses[i % statuses.length];
    const owner = Math.random() > 0.4 ? users[Math.floor(Math.random() * users.length)] : null;
    const campaign = Math.random() > 0.6 ? campaigns[Math.floor(Math.random() * campaigns.length)] : null;
    const daysAgo = Math.floor(Math.random() * 30);

    try {
      const article = await prisma.article.upsert({
        where: { urlHash: a.urlHash },
        update: {},
        create: {
          sourceId: a.sourceId,
          url: a.url,
          urlHash: a.urlHash,
          title: a.title,
          author: a.author,
          category: a.category,
          status,
          ownerId: owner?.id || null,
          campaignId: campaign?.id || null,
          publishedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
          contactEmail: a.contactEmail || null,
          contactUrl: a.contactUrl || null,
          contactType: a.contactType || (a.contactEmail ? undefined : a.contactUrl ? 'CONTACT_PAGE_ONLY' : 'NONE'),
          contactConfidence: a.contactConfidence || (a.contactEmail ? undefined : a.contactUrl ? 'MINIMAL' : 'NONE'),
          contactFoundOnUrl: a.contactEmail ? a.url : a.contactUrl || null,
          contactLastCheckedAt: a.contactEmail || a.contactUrl ? new Date() : null,
          sentAt: status === 'SENT' || status === 'COMPLETED' ? new Date(Date.now() - (daysAgo - 2) * 24 * 60 * 60 * 1000) : null,
          completedAt: status === 'COMPLETED' ? new Date(Date.now() - (daysAgo - 5) * 24 * 60 * 60 * 1000) : null,
        },
      });

      // Add contact findings for articles with discovered emails
      if (a.contactEmail) {
        await prisma.contactFinding.create({
          data: {
            articleId: article.id,
            sourceId: a.sourceId,
            email: a.contactEmail,
            normalizedEmail: a.contactEmail.toLowerCase(),
            discoveredOnUrl: a.url,
            contactType: a.contactType || 'DIRECT_AUTHOR',
            confidence: a.contactConfidence || 'MEDIUM',
            sourceContext: 'article_body',
            lastVerifiedAt: new Date(),
          },
        });
      }

      // Add status history
      await prisma.articleStatusHistory.create({
        data: {
          articleId: article.id,
          toStatus: status,
          changedBy: owner?.id || null,
        },
      });
    } catch (err) {
      // Skip duplicates
    }
  }

  // Update source article counts
  for (const source of sources) {
    const count = await prisma.article.count({ where: { sourceId: source.id } });
    await prisma.source.update({ where: { id: source.id }, data: { articleCount: count } });
  }

  // Create sample crawl jobs
  for (const source of sources.slice(0, 5)) {
    await prisma.crawlJob.create({
      data: {
        sourceId: source.id,
        status: 'COMPLETED',
        articlesFound: Math.floor(Math.random() * 20) + 5,
        articlesSaved: Math.floor(Math.random() * 10) + 2,
        startedAt: new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000),
        completedAt: new Date(),
        logs: {
          create: [
            { level: 'info', message: `Starting crawl for ${source.name}` },
            { level: 'info', message: `Found articles via ${source.crawlMethod}` },
            { level: 'info', message: 'Crawl completed successfully' },
          ],
        },
      },
    });
  }

  // Create some outreach items
  const readyArticles = await prisma.article.findMany({ where: { status: { in: ['READY', 'SENT', 'COMPLETED'] } }, take: 8 });
  for (const article of readyArticles) {
    const contact = contacts[Math.floor(Math.random() * contacts.length)];
    await prisma.outreachItem.create({
      data: {
        articleId: article.id,
        contactId: contact.id,
        campaignId: campaigns[0].id,
        assignedTo: users[Math.floor(Math.random() * users.length)].id,
        status: article.status === 'COMPLETED' ? 'sent' : article.status === 'SENT' ? 'sent' : 'queued',
        subject: `Re: ${article.title}`,
        sentAt: article.status === 'SENT' || article.status === 'COMPLETED' ? new Date() : null,
      },
    });
  }

  console.log('Seed completed!');
  console.log(`  Users: ${users.length}`);
  console.log(`  Sources: ${sources.length}`);
  console.log(`  Campaigns: ${campaigns.length}`);
  console.log(`  Contacts: ${contacts.length}`);
  console.log(`  Articles: ${articleSets.length}`);
}

function generateArticles(
  sourceId: string,
  _sourceName: string,
  domain: string,
  items: {
    title: string;
    author: string | null;
    category: string;
    email?: string;
    contactUrl?: string;
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL';
    contactType?: 'DIRECT_AUTHOR' | 'EDITORIAL' | 'GENERIC_INBOX' | 'CONTACT_PAGE_ONLY';
  }[]
) {
  return items.map((item) => {
    const slug = item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const url = `https://${domain}/${slug}`;
    return {
      sourceId,
      url,
      urlHash: hashUrl(url),
      title: item.title,
      author: item.author,
      category: item.category,
      contactEmail: item.email,
      contactUrl: item.contactUrl,
      contactConfidence: item.confidence,
      contactType: item.contactType,
    };
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
