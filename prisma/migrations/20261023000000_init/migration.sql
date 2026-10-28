CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'PAYMENT_FAILED');
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');

CREATE TABLE "customers" (
  "id" UUID NOT NULL, "email" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "products" (
  "id" UUID NOT NULL, "sku" TEXT NOT NULL, "name" TEXT NOT NULL, "price" DECIMAL(12,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id"), CONSTRAINT "products_price_nonnegative" CHECK ("price" >= 0)
);
CREATE TABLE "inventory" (
  "product_id" UUID NOT NULL, "available_quantity" INTEGER NOT NULL DEFAULT 0,
  "reserved_quantity" INTEGER NOT NULL DEFAULT 0, "version" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_pkey" PRIMARY KEY ("product_id"),
  CONSTRAINT "inventory_available_nonnegative" CHECK ("available_quantity" >= 0),
  CONSTRAINT "inventory_reserved_nonnegative" CHECK ("reserved_quantity" >= 0)
);
CREATE TABLE "orders" (
  "id" UUID NOT NULL, "customer_id" UUID NOT NULL, "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "total_amount" DECIMAL(12,2) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id"), CONSTRAINT "orders_total_nonnegative" CHECK ("total_amount" >= 0)
);
CREATE TABLE "order_items" (
  "id" UUID NOT NULL, "order_id" UUID NOT NULL, "product_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL, "unit_price" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "order_items_price_nonnegative" CHECK ("unit_price" >= 0)
);
CREATE TABLE "inventory_reservations" (
  "id" UUID NOT NULL, "order_id" UUID NOT NULL, "product_id" UUID NOT NULL, "quantity" INTEGER NOT NULL,
  "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE', "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_reservations_quantity_positive" CHECK ("quantity" > 0)
);
CREATE TABLE "idempotency_keys" (
  "id" UUID NOT NULL, "customer_id" UUID NOT NULL, "key" TEXT NOT NULL, "request_hash" TEXT NOT NULL,
  "response_body" JSONB, "order_id" UUID, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE INDEX "inventory_available_quantity_idx" ON "inventory"("available_quantity");
CREATE INDEX "orders_customer_id_created_at_idx" ON "orders"("customer_id", "created_at" DESC);
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");
CREATE UNIQUE INDEX "order_items_order_id_product_id_key" ON "order_items"("order_id", "product_id");
CREATE INDEX "inventory_reservations_status_expires_at_idx" ON "inventory_reservations"("status", "expires_at");
CREATE UNIQUE INDEX "inventory_reservations_order_id_product_id_key" ON "inventory_reservations"("order_id", "product_id");
CREATE UNIQUE INDEX "idempotency_keys_order_id_key" ON "idempotency_keys"("order_id");
CREATE UNIQUE INDEX "idempotency_keys_customer_id_key_key" ON "idempotency_keys"("customer_id", "key");
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "inventory"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
