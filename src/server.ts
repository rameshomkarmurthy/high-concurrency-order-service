
import { buildApp } from './app.js';
import { env } from './config.js';
import { prisma } from './db.js';
import { redis } from './redis.js';

const app = buildApp();

let shuttingDown = false;

async function start() {
  await redis.connect();

  await app.listen({
    host: env.HOST,
    port: env.PORT,
  });

  app.log.info(
    { host: env.HOST, port: env.PORT },
    'Order service listening',
  );
}

async function shutdown(signal: string) {
  if (shuttingDown) {
    app.log.warn('Shutdown already in progress');
    return;
  }

  shuttingDown = true;

  app.log.info({ signal }, 'Graceful shutdown started');

  // Force shutdown if graceful shutdown takes too long.
  const forceExitTimer = setTimeout(() => {
    app.log.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10_000);

  forceExitTimer.unref();

  try {
    // Stop accepting new requests and wait for active requests.
    await app.close();

    // Close Redis connection.
    
      await redis.quit();
    

    // Close Prisma database connections.
    await prisma.$disconnect();

    app.log.info('Graceful shutdown completed');

    process.exitCode = 0;
  } catch (error) {
    app.log.error({ err: error }, 'Graceful shutdown failed');
    process.exitCode = 1;
  } finally {
    clearTimeout(forceExitTimer);
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

start().catch(async (error) => {
  app.log.error({ err: error }, 'Application startup failed');

  try {
    
      await redis.quit();
    

    await prisma.$disconnect();
  } catch (cleanupError) {
    app.log.error(
      { err: cleanupError },
      'Startup cleanup failed',
    );
  }

  process.exitCode = 1;
});
