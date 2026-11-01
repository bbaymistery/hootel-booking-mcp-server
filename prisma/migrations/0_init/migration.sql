-- Enable btree_gist extension for PostgreSQL EXCLUDE constraint on scalar types (room_id)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "price_per_night_cents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "request_hash" TEXT,
    "room_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "guests" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "total_price_cents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_outbox" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "delivery_status" TEXT NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "last_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_idempotency_key_key" ON "bookings"("idempotency_key");

-- CreateIndex
CREATE INDEX "idx_bookings_overlap" ON "bookings"("room_id", "status", "check_in", "check_out");

-- CreateIndex
CREATE INDEX "idx_outbox_pending" ON "webhook_outbox"("delivery_status", "next_retry_at", "retry_count");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add PostgreSQL EXCLUDE constraint for bulletproof atomic double-booking prevention
-- Enforces that for CONFIRMED bookings on the same room, half-open intervals [check_in, check_out) cannot overlap
ALTER TABLE "bookings" 
ADD CONSTRAINT "no_overlapping_bookings"
EXCLUDE USING gist (
  "room_id" WITH =,
  daterange("check_in", "check_out", '[)') WITH &&
) WHERE ("status" = 'CONFIRMED');
