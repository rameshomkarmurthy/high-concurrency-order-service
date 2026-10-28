import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const customer = await prisma.customer.upsert({
    where: { email: 'demo@example.com' }, update: {}, create: { email: 'demo@example.com' }
  });
  const product = await prisma.product.upsert({
    where: { sku: 'DEMO-001' },
    update: {},
    create: { sku: 'DEMO-001', name: 'Demo Mechanical Keyboard', price: '49.99', inventory: { create: { availableQuantity: 10 } } }
  });
  await prisma.inventory.upsert({
    where: { productId: product.id }, update: {}, create: { productId: product.id, availableQuantity: 10 }
  });
  console.log(JSON.stringify({ customerId: customer.id, productId: product.id, availableQuantity: 10 }, null, 2));
}

main().finally(() => prisma.$disconnect());
