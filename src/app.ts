import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { redis } from './redis.js';
import { env } from './config.js';
import { createOrder, getOrder, OrderError } from './order-service.js';

const createOrderSchema = z.object({
  customerId: z.string().uuid(),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(100) })).min(1).max(50)
}).superRefine((body, ctx) => {
  const ids = body.items.map((item) => item.productId.toLowerCase());
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', message: 'Each product may appear only once; combine quantities for duplicate products.', path: ['items'] });
  }
});

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: { level: env.LOG_LEVEL }, requestIdHeader: 'x-request-id', genReqId: () => crypto.randomUUID() });
  app.register(sensible);
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await redis.ping();
      return { status: 'ready', dependencies: { postgres: 'ok', redis: 'ok' } };
    } catch {
      return reply.code(503).send({ status: 'not_ready' });
    }
  });

  app.post('/v1/orders', async (request, reply) => {
    const parsed = createOrderSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid request.' } });
    const keyHeader = request.headers['idempotency-key'];
    const key = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader;
    if (!key || key.length < 8 || key.length > 200) {
      return reply.code(400).send({ error: { code: 'INVALID_IDEMPOTENCY_KEY', message: 'Provide an Idempotency-Key header between 8 and 200 characters.' } });
    }
    try {
      const result = await createOrder(parsed.data, key);
      reply.header('Idempotency-Replayed', String(result.replayed));
      return reply.code(result.replayed ? 200 : 201).send(result.order);
    } catch (error) {
      if (error instanceof OrderError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        return reply.code(404).send({ error: { code: 'RELATED_RECORD_NOT_FOUND', message: 'A referenced record was not found.' } });
      }
      request.log.error({ err: error }, 'Order creation failed');
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
    }
  });

  app.get('/v1/orders/:id', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Order ID must be a UUID.' } });
    try { return await getOrder(params.data.id); }
    catch (error) {
      if (error instanceof OrderError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      request.log.error({ err: error }, 'Order lookup failed');
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
    }
  });
  return app;
}
