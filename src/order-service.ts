import { createHash } from 'node:crypto';
import { Prisma, type OrderStatus } from '@prisma/client';
import { prisma } from './db.js';

export type CreateOrderInput = {
  customerId: string;
  items: Array<{ productId: string; quantity: number }>;
};

export class OrderError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'OrderError';
  }
}

function canonicalize(input: CreateOrderInput): string {
  const items = [...input.items]
    .map(({ productId, quantity }) => ({ productId: productId.toLowerCase(), quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
  return JSON.stringify({ customerId: input.customerId.toLowerCase(), items });
}

function hashRequest(input: CreateOrderInput): string {
  return createHash('sha256').update(canonicalize(input)).digest('hex');
}

function serializeOrder(order: {
  id: string; customerId: string; status: OrderStatus; totalAmount: Prisma.Decimal;
  createdAt: Date; items: Array<{ productId: string; quantity: number; unitPrice: Prisma.Decimal }>;
}) {
  return {
    id: order.id,
    customerId: order.customerId,
    status: order.status,
    totalAmount: order.totalAmount.toFixed(2),
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2)
    }))
  };
}

export async function createOrder(input: CreateOrderInput, idempotencyKey: string) {
  const requestHash = hashRequest(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const prior = await tx.idempotencyKey.findUnique({
        where: { customerId_key: { customerId: input.customerId, key: idempotencyKey } }
      });
      if (prior) {
        if (prior.requestHash !== requestHash) {
          throw new OrderError('IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used with a different request.', 409);
        }
        if (prior.responseBody) return { order: prior.responseBody, replayed: true };
        // A committed key without a response should not normally occur because the key and order
        // are committed atomically. Treat it as a retryable conflict if data was manually altered.
        throw new OrderError('IDEMPOTENCY_IN_PROGRESS', 'A request with this key is still being processed.', 409);
      }

      const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true } });
      if (!customer) throw new OrderError('CUSTOMER_NOT_FOUND', 'Customer was not found.', 404);

      await tx.idempotencyKey.create({
        data: { customerId: input.customerId, key: idempotencyKey, requestHash }
      });

      const uniqueProductIds = input.items.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: { id: { in: uniqueProductIds }, active: true },
        select: { id: true, price: true }
      });
      if (products.length !== uniqueProductIds.length) {
        throw new OrderError('PRODUCT_NOT_FOUND', 'One or more products do not exist or are inactive.', 404);
      }
      const byId = new Map(products.map((product) => [product.id, product]));

      // Sort updates by product ID to reduce deadlock risk when orders contain multiple products.
      const sortedItems = [...input.items].sort((a, b) => a.productId.localeCompare(b.productId));
      for (const item of sortedItems) {
        const reservation = await tx.inventory.updateMany({
          where: { productId: item.productId, availableQuantity: { gte: item.quantity } },
          data: {
            availableQuantity: { decrement: item.quantity },
            reservedQuantity: { increment: item.quantity },
            version: { increment: 1 }
          }
        });
        if (reservation.count !== 1) {
          throw new OrderError('INSUFFICIENT_INVENTORY', `Insufficient inventory for product ${item.productId}.`, 409);
        }
      }

      const total = input.items.reduce((sum, item) => {
        const product = byId.get(item.productId)!;
        return sum.add(product.price.mul(item.quantity));
      }, new Prisma.Decimal(0));

      const order = await tx.order.create({
        data: {
          customerId: input.customerId,
          totalAmount: total,
          items: { create: input.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: byId.get(item.productId)!.price
          })) },
          reservations: { create: input.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000)
          })) }
        },
        include: { items: true }
      });
      const response = serializeOrder(order);
      await tx.idempotencyKey.update({
        where: { customerId_key: { customerId: input.customerId, key: idempotencyKey } },
        data: { orderId: order.id, responseBody: response as Prisma.InputJsonValue }
      });
      return { order: response, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5_000, timeout: 10_000 });
  } catch (error) {
    if (error instanceof OrderError) throw error;
    // Two simultaneous requests can both observe no key. The unique constraint chooses one winner.
    // The losing transaction is rolled back; after that, read and replay the winner's committed result.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const prior = await prisma.idempotencyKey.findUnique({
        where: { customerId_key: { customerId: input.customerId, key: idempotencyKey } }
      });
      if (prior) {
        if (prior.requestHash !== requestHash) {
          throw new OrderError('IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used with a different request.', 409);
        }
        if (prior.responseBody) return { order: prior.responseBody, replayed: true };
      }
    }
    throw error;
  }
}

export async function getOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new OrderError('ORDER_NOT_FOUND', 'Order was not found.', 404);
  return serializeOrder(order);
}
