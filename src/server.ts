import { buildApp } from './app.js';
import { env } from './config.js';
import { prisma } from './db.js';
import { redis } from './redis.js';

const app = buildApp();
let shuttingDown = false;

async function start() {
  await redis.connect();
  await app.listen({ host: env.HOST, port: env.PORT });
  app.log.info({ host: env.HOST, port: env.PORT }, 'Order service listening');
}

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'Graceful shutdown started');
  try {
    await app.close();
    await redis.quit();
    await prisma.$disconnect();
    process.exitCode = 0;
  } catch (error) {
    app.log.error({ err: error }, 'Graceful shutdown failed');
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
start().catch(async (error) => {
  app.log.error({ err: error }, 'Application startup failed');
  await prisma.$disconnect();
  process.exitCode = 1;
});
