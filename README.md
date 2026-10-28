# High-Concurrency Order Processing Service

A backend service built with Node.js, TypeScript, Fastify, PostgreSQL, Prisma, and Redis to demonstrate reliable order processing under concurrent requests.

## Overview

This project implements core order-processing workflows with a focus on data consistency, concurrency control, and reliable API behavior.

It is designed to prevent inventory overselling when multiple requests attempt to purchase the same product simultaneously.

## Features

- REST API for creating and retrieving orders
- Inventory reservation with concurrency-safe database updates
- Idempotent order creation using idempotency keys
- Transaction-based order processing
- PostgreSQL persistence using Prisma ORM
- Redis connectivity and readiness checks
- Integration tests for concurrent requests and failure scenarios

## Technology Stack

- Node.js
- TypeScript
- Fastify
- PostgreSQL
- Prisma ORM
- Redis
- Vitest
- Docker

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health/live` | Checks whether the service is running |
| GET | `/health/ready` | Checks service and dependency readiness |
| POST | `/v1/orders` | Creates an order |
| GET | `/v1/orders/:id` | Retrieves an order by ID |

## Local Setup

### Prerequisites

Install the following:

- Node.js 22.13.0 or compatible
- npm
- Docker Desktop
- PostgreSQL
- Redis

### Install dependencies

```bash
npm install
```

### Configure environment variables

Create a `.env` file in the project root and configure the database and Redis connection strings.

Do not commit secrets or credentials to GitHub.

### Run database migrations

```bash
npx prisma migrate deploy
```

### Seed sample data

```bash
npm run db:seed
```

### Start the development server

```bash
npm run dev
```

The API will be available at:

```text
http://127.0.0.1:3000
```

## Testing

Run the test suite:

```bash
npm test
```

Run TypeScript type checking:

```bash
npm run typecheck
```

Run linting:

```bash
npm run lint
```

Build the project:

```bash
npm run build
```

## Engineering Focus

This project explores backend engineering concepts such as:

- Handling concurrent requests safely
- Preventing inventory overselling
- Implementing idempotent APIs
- Using database transactions
- Testing race conditions and rollback scenarios
- Separating API, business logic, and persistence concerns

## Project Status

The core order creation flow, inventory consistency checks, idempotency behavior, and integration tests have been implemented.

Further development may include payment workflows, observability, and production deployment.

## Disclaimer

This is a learning and portfolio project. It is not intended to process real payments or production customer orders.
