# High-Concurrency Order Processing Service

A production-inspired backend project built with Node.js, TypeScript, Fastify, PostgreSQL, Prisma, and Redis. The initial slice demonstrates transaction-safe inventory reservation, request idempotency, schema constraints, health checks, and real-PostgreSQL integration tests.

> **Status:** starter implementation. Payment processing, reservation expiry worker, outbox publisher, authentication, and production deployment are not implemented yet. Do not describe this as production-ready.

## Features in this increment

- REST endpoints for order creation and retrieval.
- Conditional inventory updates inside a PostgreSQL transaction.
- Persistent idempotency keys scoped to customer ID.
- Request hashing: same key + same request replays the saved response; same key + different request returns `409`.
- Order, item, reservation, inventory, and idempotency schema with constraints and indexes.
- Liveness and readiness endpoints; readiness checks PostgreSQL and Redis.
- Integration tests against a disposable PostgreSQL database.
- Dockerfile and optional Compose services for local dependencies.

## Requirements

- Node.js 20+
- PostgreSQL 15+ (16 recommended)
- Redis 7+
- npm

## Run locally

1. Create a PostgreSQL database and a separate disposable test database:

   ```sql
   CREATE DATABASE order_service;
   CREATE DATABASE order_service_test;
   ```

2. Ensure PostgreSQL and Redis are running. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

   Update `DATABASE_URL` and `TEST_DATABASE_URL` to match your local credentials. Keep the test database separate; integration tests write and clean up test data.

3. Install dependencies and generate Prisma Client:

   ```bash
   npm install
   npm run db:generate
   npm run db:deploy
   npm run db:seed
   ```

4. Start the API:

   ```bash
   npm run dev
   ```

5. Check health:

   ```bash
   curl http://127.0.0.1:3000/health/live
   curl http://127.0.0.1:3000/health/ready
   ```

If you want to run only PostgreSQL and Redis in containers, `docker compose up -d` is optional. The application itself can run on your host machine.

## Create an order

The seed command prints a customer UUID and product UUID. Use those exact values:

```bash
curl -i -X POST http://127.0.0.1:3000/v1/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: checkout-demo-0001' \
  -d '{"customerId":"<CUSTOMER_UUID>","items":[{"productId":"<PRODUCT_UUID>","quantity":2}]}'
```

Repeat the exact request with the same key to receive the stored response. Change the payload but keep the key to receive `409 IDEMPOTENCY_KEY_REUSED`.

Get an order:

```bash
curl http://127.0.0.1:3000/v1/orders/<ORDER_UUID>
```

## Test and build

```bash
npm run typecheck
npm test
npm run build
```

For integration tests, set `TEST_DATABASE_URL` to the separate test database in `.env`. Tests fail intentionally if it is missing; they do not silently fall back to a developer database. Apply migrations to that database before testing:

```bash
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
npm test
```

The concurrency test launches 30 independent order requests against stock of 10 and asserts that exactly 10 reservations succeed. The idempotency test checks response replay and payload mismatch. These are test expectations, not pre-claimed benchmark results; run the tests in your environment and record the actual output.

## API contract

### `POST /v1/orders`

Headers:
- `Idempotency-Key`: required, 8–200 characters.
- `Content-Type: application/json`.

Body:

```json
{
  "customerId": "<customer-uuid>",
  "items": [
    { "productId": "<product-uuid>", "quantity": 2 }
  ]
}
```

Responses:
- `201`: newly created order.
- `200`: replayed response for an identical idempotent request.
- `400`: invalid request or missing/invalid idempotency key.
- `404`: customer/product not found.
- `409`: insufficient inventory or idempotency key reused with a different payload.
- `500`: unexpected server error.

The response includes an `Idempotency-Replayed` header. Do not expose raw database error details to clients.

### `GET /v1/orders/:id`

Returns order details and line items, or `404` if the order doesn't exist.

### Health endpoints

- `GET /health/live`: process liveness only.
- `GET /health/ready`: PostgreSQL and Redis connectivity.

## Concurrency and correctness notes

- Inventory is decremented with a single conditional `UPDATE ... WHERE available_quantity >= quantity`, executed by Prisma `updateMany` inside a transaction. The affected-row count determines whether reservation succeeded.
- The database `CHECK` constraint is a second line of defense against negative quantities.
- The unique `(customer_id, key)` constraint arbitrates simultaneous idempotency-key claims. A losing request catches the unique-key error and reads the winner's committed response.
- The idempotency record, order, order items, and inventory reservations commit together. A failed transaction rolls them all back.
- Inventory updates are ordered by product ID to reduce (not eliminate) deadlock risk for multi-item orders.
- Price is copied to the order item at purchase time so later product price changes do not rewrite order history.
- PostgreSQL is the source of truth for stock. Redis is currently used for connectivity/readiness only; do not use a Redis lock as the only oversell guard.
- The current isolation level is `READ COMMITTED`. The conditional update is the key inventory guard; expand testing before changing isolation levels or adding bulk workflows.
- There is no authentication yet. Customer IDs in requests are trusted demo inputs and must not be exposed as-is in a public deployment.

## Next engineering milestones

1. Add authenticated customer identity and per-customer authorization.
2. Add explicit cancellation/payment state transitions and webhook deduplication.
3. Implement reservation expiry with safe concurrent release.
4. Add a transactional outbox and idempotent consumer.
5. Add metrics, tracing, structured business events, and rate limiting.
6. Add k6 load tests and publish reproducible p50/p95/p99 latency, throughput, error rate, and environment details.
7. Add CI workflow for typecheck, build, migration validation, and integration tests against a disposable PostgreSQL service.

## Repository structure

```text
src/                 Fastify app, config, DB clients, order service
prisma/schema.prisma Prisma data model
prisma/migrations/   Versioned SQL migration
prisma/seed.ts       Demo customer/product seed
 tests/              PostgreSQL integration tests
docs/                Design notes (expand as milestones land)
```

## License

MIT
