import { PrismaClient } from '@/generated/prisma';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const url = new URL(process.env.DATABASE_URL!);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace('/', ''),
    // One pool serves both the web app and background crawls. At 5, a crawl
    // running a few articles concurrently could take every connection, leaving
    // page loads — and the crawl's own logging — waiting on the pool.
    connectionLimit: 15,
    // Without this a starved pool waits indefinitely and the failure is silent.
    // Better to throw so it lands in the logs.
    acquireTimeout: 20000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
