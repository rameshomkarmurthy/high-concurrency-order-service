# Architecture and design decisions

## Initial architecture

A modular monolith keeps the first version easy to run and debug while preserving boundaries between HTTP routes, business logic, persistence, and infrastructure. Split services only when there is a demonstrated ownership, scaling, or deployment need.

## Inventory invariant

For a reservation of quantity `q`, execute a conditional inventory update inside the order transaction:

```sql
UPDATE inventory
SET available_quantity = available_quantity - $quantity,
    reserved_quantity = reserved_quantity + $quantity
WHERE product_id = $product_id
  AND available_quantity >= $quantity;
```

Exactly one affected row means reservation succeeded. Zero affected rows means stock was insufficient (or the inventory row is missing). A later failure rolls the transaction back, restoring inventory automatically.

## Idempotency

The request hash includes customer ID and a canonicalized, sorted list of product IDs and quantities. A unique database constraint on `(customer_id, key)` handles concurrent key claims. The response and order are committed in one transaction, so a committed idempotency record should contain a response. If an unexpected unique constraint error occurs, the losing transaction rolls back and attempts to read the winner's response.

## Trade-offs and known gaps

- `READ COMMITTED` plus conditional updates is sufficient for this inventory primitive; multi-row workflows still require deadlock handling and concurrency tests.
- The current service returns an insufficient-inventory error for both absent inventory and zero stock; a later refinement can distinguish them without weakening the atomic guard.
- Reservations are created with a 15-minute expiry, but an expiry worker is not implemented in this starter slice. Until that worker exists, reserved stock is not automatically released.
- Redis is not involved in stock correctness.
- There is no auth, real payment gateway, webhook handler, cancellation endpoint, or outbox publisher yet.
