import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createOrder, OrderError } from '../src/order-service.js';

// These are real PostgreSQL integration tests, not mocked unit tests.
// Run only against a disposable database configured with TEST_DATABASE_URL.
const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) process.env.DATABASE_URL = testUrl;
const prisma = new PrismaClient({ datasources: { db: { url: testUrl ?? process.env.DATABASE_URL } } });

let customerId = '';
let productId = '';

beforeAll(async () => {
  if (!testUrl) throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database before running integration tests.');
  const customer = await prisma.customer.create({ data: { email: `integration-${crypto.randomUUID()}@example.test` } });
  const product = await prisma.product.create({
    data: { sku: `TEST-${crypto.randomUUID()}`, name: 'Integration Product', price: '12.50', inventory: { create: { availableQuantity: 10 } } }
  });
  customerId = customer.id;
  productId = product.id;
});

beforeEach(async () => {
  // Keep cases independent: prior test orders and idempotency records must not affect stock.
  await prisma.idempotencyKey.deleteMany({ where: { customerId } });
  await prisma.order.deleteMany({ where: { customerId } });
  await prisma.inventory.update({ where: { productId }, data: { availableQuantity: 10, reservedQuantity: 0 } });
});

afterAll(async () => {
  if (customerId) {
    await prisma.idempotencyKey.deleteMany({ where: { customerId } });
    await prisma.order.deleteMany({ where: { customerId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
  }
  if (productId) {
    await prisma.inventoryReservation.deleteMany({ where: { productId } });
    await prisma.inventory.deleteMany({ where: { productId } });
    await prisma.orderItem.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
  }
  await prisma.$disconnect();
});

describe('createOrder PostgreSQL integration', () => {
  it('never oversells under concurrent requests', async () => {
    const results = await Promise.allSettled(Array.from({ length: 30 }, (_, i) =>
      createOrder({ customerId, items: [{ productId, quantity: 1 }] }, `oversell-test-${i}-${crypto.randomUUID()}`)
    ));
    const successes = results.filter((result) => result.status === 'fulfilled');
    const inventory = await prisma.inventory.findUniqueOrThrow({ where: { productId } });
    expect(successes).toHaveLength(10);
    expect(inventory.availableQuantity).toBe(0);
    expect(inventory.reservedQuantity).toBe(10);
    expect(results.filter((result) => result.status === 'rejected').every((result) =>
      result.status === 'rejected' && result.reason instanceof OrderError && result.reason.code === 'INSUFFICIENT_INVENTORY'
    )).toBe(true);
  }, 30_000);

  it('replays a duplicate request and rejects a key reused with a different payload', async () => {
    const key = `idem-test-${crypto.randomUUID()}`;
    const input = { customerId, items: [{ productId, quantity: 1 }] };
    const first = await createOrder(input, key);
    const replay = await createOrder(input, key);
    expect(first.order).toEqual(replay.order);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    await expect(createOrder({ ...input, items: [{ productId, quantity: 2 }] }, key))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', statusCode: 409 });
  }, 30_000);
});
