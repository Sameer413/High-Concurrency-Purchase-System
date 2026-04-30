# Redis Lock Based Purchase Flow

This document details the architecture and implementation steps for using a Redis lock to solve simultaneous purchase issues (Option C Architecture), along with its benefits and architectural limitations.

## 🎯 The Problem

When multiple users attempt to purchase an item with limited stock simultaneously, we encounter a race condition.

**Example Scenario:**
- Product stock = 1
- User A clicks "Buy"
- User B clicks "Buy" in the exact same second

**Without a lock:** Both requests may read the database simultaneously, see `stock = 1`, and proceed with the purchase. This results in overselling the product (stock drops below 0).

---

## 🏗️ High-Level Architecture

To solve this, we introduce Redis as a traffic controller while MongoDB remains our source of truth. 

**Request Flow:**
`Client` → `NestJS API` → `Redis Lock Check` → `MongoDB Stock + Order` → `Payment Gateway`

We create a temporary lock in Redis (e.g., `lock:product:123`). Only the first request to successfully set this lock gets to process the order.

---

## 🔄 Steps to Implement

### Step 1: User clicks Buy
The backend attempts to acquire a Redis lock before reading any database values.
```
SET lock:product:123 uniqueValue NX EX 10
```
- **`NX`**: Set only if the key does not exist.
- **`EX 10`**: Set an expiration time of 10 seconds (TTL).

*Outcome:* 
- If successful → Continue to Step 2.
- If failure → Another request is already processing this product. Return an error or tell the client to wait.

### Step 2: Read Product in MongoDB
Once the lock is acquired, safely check the stock in the database.
- If `stock > 0`: Decrement stock and create a pending order.
- If `stock == 0`: Release the lock and cancel the flow (Out of Stock).

### Step 3: Release Lock
Immediately after the database updates (stock decrement + order creation), remove the Redis lock. 

### Step 4: Proceed to Payment Flow
With the stock safely reserved, send the user into the payment flow.

**Payment Handling:**
- **Success:** Order status = `SUCCESS`
- **Fail:** Order status = `FAILED`. Crucially, you must restore the stock (`+1`) so another user can buy it.

---

## 🔥 NestJS Implementation Structure

This implementation generally touches the following modules in a NestJS application:

- `ProductModule`
- `OrderModule`
- `PaymentModule`
- `RedisService`
- `PurchaseService`

**Example `PurchaseLogic` flow:**
1. Acquire lock
2. Check stock
3. Decrement stock
4. Create pending order
5. Release lock
6. Wait for payment result
7. Update order (and restore stock if payment fails)

---

## 🧠 Benefits & Architectural Trade-offs

### Pros
- **Extremely Fast:** Redis is an in-memory datastore, meaning lock acquisition takes fractions of a millisecond.
- **Good for High Traffic:** Helps prevent DB bottlenecks during flash sales.
- **Multi-Server Safe:** If the application scales to many server instances (`API-1`, `API-2`, `API-3`), they all share the exact same Redis instance. Only ONE server processes the product update at any given time.

### Limitations & Cons (Trade-offs)
- **Extra Infrastructure:** Requires setting up, maintaining, and paying for an external Redis server.
- **Increased Complexity:** Managing temporary states, TTLs, and failure recovery is more complex than a simple database ACID transaction or single atomic atomic update (`$inc`).
- **TTL Deadlocks:** If a server takes the lock and crashes, the lock could stay permanently unless a Time-To-Live (`EX 10`) is assigned. TTL is essential to automatically release stuck locks.

---

## 🎯 Summary

**When to use what:**
- **For moderate scale:** Use MongoDB atomic updates only (e.g. `$inc` with condition `stock > 0`). 
- **For high scale / multi-instance (Flash Sales):** Use the Redis lock architecture.

**Final Blunt Answer:**
The distributed Redis lock architecture acts as a highly efficient traffic controller, ensuring MongoDB (the source of truth) is never tasked with resolving simultaneous data hazards.
