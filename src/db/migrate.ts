import type Database from 'better-sqlite3';
import { getDb } from './connection.js';

export function runMigrations(db: Database.Database = getDb()): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK(capacity > 0),
      price_per_night_cents INTEGER NOT NULL CHECK(price_per_night_cents >= 0),
      status TEXT NOT NULL CHECK(status IN ('AVAILABLE', 'MAINTENANCE', 'INACTIVE')) DEFAULT 'AVAILABLE'
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE
    );

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
  `);
}

// Standalone execution support
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  try {
    runMigrations();
    console.error('[Migrations] Database migrations completed successfully.');
  } catch (error: unknown) {
    console.error('[Migrations Error]', error);
    process.exit(1);
  }
}
