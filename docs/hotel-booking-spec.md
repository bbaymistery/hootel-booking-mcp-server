# Technical Specification: Hotel Booking MCP Server (OpenSpec v1.2.1)

**Document Version:** 1.2.1  
**Target Architecture:** Node.js, TypeScript (Strict Mode, zero `any`), Official MCP TypeScript SDK (`StdioServerTransport`), Zod, SQLite (`better-sqlite3`, WAL Mode, `IMMEDIATE` Transactions)  
**Status:** Approved & Implemented

---

## Specification Changelog

### v1.2.1 (Current Approved Version)
- **Retry Policy & Attempt Accounting:** Defined the retry lifecycle as exactly 5 total delivery attempts (1 initial attempt + 4 retries). State lifecycle: events start with `retry_count = 0`; upon each failure, `retry_count` is incremented. If `retry_count < 5`, the event remains `PENDING` with `next_retry_at` scheduled; upon failing the 5th attempt (`retry_count === 5`), the event permanently transitions to `FAILED`.
- **Consistent Retry Schedule:** Pinned delays between retry attempts to: **`1s, 5s, 15s, 30s`**.
- **Century-Safe Date Validation:** Enforced the **`2000–2099`** year range across all validation schemas, regex patterns, and test suites to prevent JavaScript `Date.UTC` 0–99 rollover anomalies while enforcing leap-year correctness.

### v1.2.0
- **Currency & Minor Units:** Explicitly pinned demo currency to **USD**. All pricing stored strictly in integer cents (`price_per_night_cents`, `total_price_cents`) and formatted as USD strings (e.g., `"$220.00 USD"`).
- **Full Payload Idempotency Validation:** Idempotency checks compare a canonical SHA-256 hash of the complete normalized request payload (`room_id`, `customer_name`, `customer_email`, `check_in`, `check_out`, `guests`). Exact matches return the existing confirmation; any payload discrepancies reject with `IDEMPOTENCY_CONFLICT`.
- **At-Least-Once Webhook Delivery & Receiver Deduplication:** Formally defined the outbox delivery model as **at-least-once**. The simulated webhook receiver maintains an `event_id` deduplication index to enforce receiver-side idempotency.
- **Multi-Process / Dual-Connection Concurrency Testing:** Concurrency test uses two independent `better-sqlite3` database connections across separate worker threads against a shared file in WAL mode.
- **Subprocess-Level Stdio MCP Integration Testing:** Validates the MCP protocol layer using `StdioClientTransport` spawning the server as a child process with piped `stdin`/`stdout`, verifying stream isolation from `stderr`.

---

## 1. Architecture Overview

### 1.1 High-Level Component Architecture

```
+-----------------------------------------------------------------------------------+
|                        MCP Client (e.g. Claude Desktop)                           |
+-----------------------------------------------------------------------------------+
                                          |
                                          | JSON-RPC 2.0 over stdio (Standard Streams)
                                          | (STDOUT: JSON-RPC frames ONLY)
                                          | (STDERR: All application & webhook logs)
                                          v
+-----------------------------------------------------------------------------------+
|                                 MCP Server Layer                                  |
|  - MCP Server Core (`@modelcontextprotocol/sdk/server/mcp.js`)                    |
|  - StdioServerTransport (`@modelcontextprotocol/sdk/server/stdio.js`)             |
|  - Zod Validation Interceptors                                                    |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                              Business Service Layer                               |
|  - AvailabilityService: Performs read-only room search & interval overlap algebra |
|  - BookingService: OWNS the atomic booking transaction (BEGIN IMMEDIATE)          |
+-----------------------------------------------------------------------------------+
                                          |
                      Atomic Transaction Boundary (BEGIN IMMEDIATE)
                                          v
+-----------------------------------------------------------------------------------+
|                             SQLite Database Layer                                 |
|  - Connection: `better-sqlite3` (WAL mode, foreign keys ON, busy_timeout=5000ms)  |
|  - Serialization: Database-level RESERVED lock acquired at transaction start      |
|  - Tables: rooms, customers, bookings, webhook_outbox                             |
+-----------------------------------------------------------------------------------+
                                          |
                          Post-Commit Event Notification
                                          v
+-----------------------------------------------------------------------------------+
|                    Transactional Outbox & Webhook Dispatcher                      |
|  - At-Least-Once Delivery Dispatcher (post-commit trigger + startup recovery)      |
|  - Backoff Retry Pipeline (5 attempts max, transitions to FAILED on exhaustion)   |
|  - Simulated Receiver with event_id Deduplication (Logs strictly to stderr)       |
+-----------------------------------------------------------------------------------+
```

### 1.2 Stream Separation
- **`stdout`**: Strictly reserved for newline-delimited JSON-RPC 2.0 protocol frames.
- **`stderr`**: Used exclusively for database logging, server lifecycle notifications, and simulated webhook receiver audit trails. Non-JSON-RPC text on `stdout` would corrupt client protocol parsers.

---

## 2. Currency & Database Models

### 2.1 Currency & Precision
- **Currency Code:** `USD`
- **Storage Format:** Integer cents (`price_per_night_cents`, `total_price_cents`). For example, `$220.00` is stored as `22000`.
- **Calculations:**
  $$\text{nights} = \frac{\text{check\_out\_timestamp} - \text{check\_in\_timestamp}}{86400000}$$
  $$\text{total\_price\_cents} = \text{nights} \times \text{price\_per\_night\_cents}$$

### 2.2 DDL Schema Definition (SQLite)

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK(capacity > 0),
    price_per_night_cents INTEGER NOT NULL CHECK(price_per_night_cents >= 0),
    status TEXT NOT NULL CHECK(status IN ('AVAILABLE', 'MAINTENANCE', 'INACTIVE')) DEFAULT 'AVAILABLE'
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE
);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY NOT NULL,
    idempotency_key TEXT UNIQUE,
    request_hash TEXT,
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    check_in TEXT NOT NULL CHECK(check_in LIKE '____-__-__'),
    check_out TEXT NOT NULL CHECK(check_out LIKE '____-__-__'),
    guests INTEGER NOT NULL CHECK(guests > 0),
    currency TEXT NOT NULL DEFAULT 'USD',
    total_price_cents INTEGER NOT NULL CHECK(total_price_cents >= 0),
    status TEXT NOT NULL CHECK(status IN ('CONFIRMED', 'CANCELLED')) DEFAULT 'CONFIRMED',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (check_out > check_in)
);

-- Transactional Outbox table
CREATE TABLE IF NOT EXISTS webhook_outbox (
    id TEXT PRIMARY KEY NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    delivery_status TEXT NOT NULL CHECK(delivery_status IN ('PENDING', 'DELIVERED', 'FAILED')) DEFAULT 'PENDING',
    retry_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at TEXT,
    last_attempt_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_overlap 
ON bookings (room_id, status, check_in, check_out);

CREATE INDEX IF NOT EXISTS idx_bookings_idempotency 
ON bookings (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_email 
ON customers (email);

CREATE INDEX IF NOT EXISTS idx_outbox_pending 
ON webhook_outbox (delivery_status, next_retry_at, retry_count);
```

---

## 3. Date Validation & Overlap Interval Algebra

### 3.1 Strict Calendar-Date Parsing
1. **Format & Range:** Regex `^(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$`. Restricts years to `2000–2099`.
2. **Component Validation:** Extract `year`, `month`, `day`.
3. **UTC Round-trip Invariance:**
   ```typescript
   const date = new Date(Date.UTC(2000, 0, 1));
   date.setUTCFullYear(year, month - 1, day);
   ```
   Ensures `date.getUTCFullYear() === year`, `date.getUTCMonth() === month - 1`, and `date.getUTCDate() === day`. Correctly accepts `2028-02-29` (leap year) and rejects `2026-02-29` (non-leap year) and `2026-04-31` (April has 30 days).

### 3.2 Half-Open Interval Overlap Rule `[check_in, check_out)`
Reservations are half-open intervals. Two intervals $[A_{\text{in}}, A_{\text{out}})$ and $[B_{\text{in}}, B_{\text{out}})$ conflict if:
$$\text{Conflict} \iff (B_{\text{in}} < A_{\text{out}}) \land (B_{\text{out}} > A_{\text{in}})$$
If $B_{\text{in}} = A_{\text{out}}$, there is no conflict, enabling same-day turnovers.

---

## 4. MCP Tools & Idempotency

### 4.1 Tool 1: `check_availability`
- **Inputs:** `check_in` (YYYY-MM-DD), `check_out` (YYYY-MM-DD), `guests` (integer >= 1).
- **Service Owner:** `AvailabilityService` executes read-only SQL queries filtering rooms by capacity, status, and non-overlapping dates.
- **Output:** Available rooms with `room_id`, `name`, `capacity`, `price_per_night_cents`, `price_per_night_formatted`, `total_price_cents`, `total_price_formatted`, `nights`, `currency: "USD"`.

### 4.2 Tool 2: `book_room`
- **Inputs:** `room_id`, `customer_name`, `customer_email`, `check_in`, `check_out`, `guests`, `idempotency_key?`.
- **Service Owner:** `BookingService` owns and executes the entire atomic unit of work inside `db.transaction(fn).immediate()`.
- **Canonical Hash Idempotency:**
  1. Computes SHA-256 hash of normalized inputs: `{ check_in, check_out, customer_email, customer_name, guests, room_id }`.
  2. If `idempotency_key` exists:
     - Exact hash match: returns original booking with `is_idempotent_replay: true`.
     - Hash mismatch: aborts with `IDEMPOTENCY_CONFLICT` (409).
- **Output:** Confirmed booking details, total pricing, customer details, and `is_idempotent_replay` status.

---

## 5. Concurrency & SQLite Locking Strategy

- SQLite enforces database-level locks.
- `BookingService` executes transactions with **`BEGIN IMMEDIATE`** via `better-sqlite3`:
  ```typescript
  const bookingTx = db.transaction((params: BookingParams) => {
    // 1. Idempotency & hash check
    // 2. Room existence, capacity, status check
    // 3. Overlap check query
    // 4. Customer upsert
    // 5. Booking insert
    // 6. Outbox event insert
    return result;
  });

  const result = bookingTx.immediate(params);
  ```
- **Serialization Guarantee:** An immediate transaction acquires a `RESERVED` write lock at transaction start before reading. Concurrent booking transactions wait up to `busy_timeout` (5000ms), guaranteeing zero double-bookings.

---

## 6. Webhook Outbox: At-Least-Once Delivery & Deduplication

### 6.1 Transactional Guarantee & Delivery Lifecycle
- **Atomicity:** The booking row and `webhook_outbox` event are committed in the **exact same database transaction**.
- **Delivery Semantic:** **At-least-once**.
- **Total Attempt Budget:** Exactly 5 total attempts (1 initial attempt + 4 retries).
- **Retry Backoff Schedule:** Delays between attempts: **`1s, 5s, 15s, 30s`**.
  - Attempt 1: Immediate post-commit dispatch (fails $\rightarrow$ `retry_count: 1`, `PENDING`, `next_retry_at = now + 1s`)
  - Attempt 2: After $+1\text{s}$ (fails $\rightarrow$ `retry_count: 2`, `PENDING`, `next_retry_at = now + 5s`)
  - Attempt 3: After $+5\text{s}$ (fails $\rightarrow$ `retry_count: 3`, `PENDING`, `next_retry_at = now + 15s`)
  - Attempt 4: After $+15\text{s}$ (fails $\rightarrow$ `retry_count: 4`, `PENDING`, `next_retry_at = now + 30s`)
  - Attempt 5: After $+30\text{s}$ (fails $\rightarrow$ `retry_count: 5`, **`FAILED`**, `next_retry_at = NULL`)
- **Crash Recovery:** On server boot, `recoverPendingEvents()` queries pending events with `retry_count < 5` and re-enqueues them.
- **Receiver Deduplication:** The simulated receiver tracks seen `event_id`s, ignoring duplicate deliveries.

---

## 7. Testing Strategy

1. **Strict Date Validation:** Leap years, month bounds, and century range `2000–2099`.
2. **Money Calculations:** Nights and cents arithmetic without floating-point errors.
3. **Availability Queries:** Capacity filtering, maintenance status exclusion, and half-open interval checks.
4. **Transactional Booking:** Atomic row creation in `bookings` and `webhook_outbox`.
5. **Idempotency Replay vs Conflict:** Verifies identical payloads replay; conflicting payloads fail.
6. **Outbox Lifecycle:** Verifies 5-attempt retry progression to `FAILED`, rollback isolation, and deduplication.
7. **Crash Recovery:** Startup recovery of uncommitted `PENDING` outbox records.
8. **True Concurrency Test:** Multi-threaded test using two independent worker threads and separate SQLite connections executing `BEGIN IMMEDIATE` simultaneously.
9. **Subprocess Stdio MCP Transport:** Spawns the compiled server as a child process and communicates over real piped `stdin`/`stdout` using `@modelcontextprotocol/sdk/client/stdio.js`.
