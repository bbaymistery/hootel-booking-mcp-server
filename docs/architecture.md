# Hotel Booking MCP Server: Architecture Specification

This document provides the architectural specification and component interaction diagrams for the Hotel Booking MCP Server.

---

## 1. System Architecture Diagram

```mermaid
flowchart TD
    Client["AI Agent / MCP Client (Claude Desktop)"]
    
    subgraph TransportLayer ["Transport & Stream Isolation"]
        StdioStream["JSON-RPC 2.0 over stdio\n(STDOUT: Protocol Frames Only)"]
        StderrSink["Diagnostic & Audit Sink\n(STDERR: Logs & Webhooks Only)"]
    end

    subgraph ServerLayer ["Node.js MCP Server (Official SDK)"]
        McpServerCore["McpServer Core (@modelcontextprotocol/sdk)"]
        StdioTransport["StdioServerTransport"]
        CheckAvailTool["Tool: check_availability"]
        BookRoomTool["Tool: book_room"]
    end

    subgraph ServiceLayer ["Business Logic Layer"]
        AvailabilityService["AvailabilityService\n(Performs Availability Checks & Overlap Logic)"]
        BookingService["BookingService\n(OWNS Atomic Booking Transaction)"]
    end

    subgraph DatabaseLayer ["SQLite Database (better-sqlite3)"]
        WALMode["WAL Mode & foreign_keys = ON"]
        TxBoundary["Atomic Transaction Boundary (BEGIN IMMEDIATE)"]
        RoomsTable[("rooms table")]
        CustomersTable[("customers table")]
        BookingsTable[("bookings table")]
        OutboxTable[("webhook_outbox table")]
    end

    subgraph WebhookLayer ["Transactional Outbox Pipeline"]
        OutboxDispatcher["Webhook Dispatcher\n(Post-Commit Async & Startup Recovery)"]
        SimulatedReceiver["Simulated Webhook Receiver\n(event_id Deduplication Index)"]
    end

    %% Client and Server Connections
    Client <-->|tools/list, tools/call| StdioStream
    StdioStream <--> StdioTransport
    StdioTransport <--> McpServerCore
    McpServerCore --> CheckAvailTool
    McpServerCore --> BookRoomTool

    %% Tool to Service Connections
    CheckAvailTool -->|Validated Input| AvailabilityService
    BookRoomTool -->|Validated Input & Idempotency Key| BookingService

    %% Service to Database Interactions
    AvailabilityService -->|Read-only Overlap & Capacity Queries| RoomsTable
    AvailabilityService -.->|Checks Overlapping Confirmed Bookings| BookingsTable

    BookingService -->|Initiates Write Reservation| TxBoundary
    TxBoundary -->|1. Overlap & Capacity Check| RoomsTable
    TxBoundary -->|2. Upsert Customer| CustomersTable
    TxBoundary -->|3. INSERT Booking Record| BookingsTable
    TxBoundary -->|4. INSERT Outbox Event - Atomically| OutboxTable

    %% Outbox Trigger and Delivery
    TxBoundary -.->|Post-Commit Event Trigger| OutboxDispatcher
    OutboxDispatcher -->|Deliver Event| SimulatedReceiver
    SimulatedReceiver -->|Update delivery_status = DELIVERED| OutboxTable
    SimulatedReceiver --> StderrSink
```

---

## 2. Service Ownership & Boundaries

### 2.1 `AvailabilityService` (Search & Query Boundary)
- **Role:** Performs read-only availability calculations and queries.
- **Responsibilities:**
  - Evaluates half-open intervals $[ \text{check\_in}, \text{check\_out} )$.
  - Queries `rooms` that have status `'AVAILABLE'`, have `capacity >= guests`, and have no overlapping confirmed reservations in `bookings`.
  - Calculates stay duration (nights) and total pricing in USD cents.
  - **Does NOT initiate database write transactions or generate booking events.**

### 2.2 `BookingService` (Atomic Transaction Owner)
- **Role:** Owns the end-to-end atomic reservation transaction.
- **Responsibilities:**
  - Coordinates input normalization and generates canonical SHA-256 request hashes.
  - Controls the `better-sqlite3` **`BEGIN IMMEDIATE`** transaction boundary (`db.transaction(fn).immediate()`), acquiring SQLite's database-level `RESERVED` write lock before any read checks are performed.
  - Manages full-payload idempotency: matching keys replay original confirmations (`is_idempotent_replay: true`), while altered payloads fail with `IDEMPOTENCY_CONFLICT`.
  - Verifies room eligibility, capacity, and conflicting confirmed bookings within the locked transaction.
  - Upserts the customer record.
  - Inserts the confirmed booking record into `bookings`.
  - **Atomically inserts the `booking.created` event into `webhook_outbox` within the exact same database transaction.**
  - Triggers post-commit dispatch only after the transaction commits successfully.

---

## 3. Webhook Outbox & Concurrency Guarantees

### 3.1 Transactional Outbox Pattern
A booking failure or database error rolls back the transaction completely, guaranteeing that no booking row and no outbox event are persisted. Once committed, the outbox dispatcher guarantees **at-least-once delivery**:
1. **Immediate Post-Commit Dispatch:** Delivered asynchronously without delaying the client's MCP response.
2. **Backoff Schedule:** On transient failure, retries up to 5 total attempts with delays of **`1s, 5s, 15s, 30s`**.
3. **Dead-Letter State:** After 5 failed attempts, the event permanently transitions to `FAILED`.
4. **Crash Recovery Sweep:** On server restart, `WebhookService.recoverPendingEvents()` re-enqueues any undelivered `PENDING` events.
5. **Receiver Idempotency:** The simulated receiver maintains an in-memory `event_id` deduplication index to ensure duplicate delivery attempts do not cause duplicate side effects.

### 3.2 Concurrency & SQLite Writer Serialization
- SQLite serializes all write operations at the database level.
- By acquiring the write lock at the start of the transaction via `BEGIN IMMEDIATE`, concurrent writers wait for active reservations to commit before checking room availability.
- This design guarantees serializable isolation and eliminates double-booking race conditions without relying on unsupported row-level locks.
