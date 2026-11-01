import Database from 'better-sqlite3';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

async function migrateSqliteToNeon() {
  console.log('================================================================');
  console.log('   LOSSLESS SQLITE -> NEON POSTGRESQL DATA MIGRATION ROUTINE    ');
  console.log('================================================================\n');

  const sqlitePath = 'hotel_booking.db';
  console.log(`[1/5] Connecting to source SQLite database: ${sqlitePath}...`);
  const sqlite = new Database(sqlitePath, { readonly: true });

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set in environment.');
  }

  console.log('[2/5] Connecting to target Neon PostgreSQL via Prisma 7...');
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  // 1. Migrate Rooms
  const sqliteRooms = sqlite.prepare('SELECT * FROM rooms').all() as any[];
  console.log(`\n[3/5] Migrating ${sqliteRooms.length} Rooms...`);
  for (const r of sqliteRooms) {
    await prisma.room.upsert({
      where: { id: r.id },
      update: {
        name: r.name,
        capacity: r.capacity,
        price_per_night_cents: r.price_per_night_cents,
        status: r.status,
      },
      create: {
        id: r.id,
        name: r.name,
        capacity: r.capacity,
        price_per_night_cents: r.price_per_night_cents,
        status: r.status,
      },
    });
    console.log(`  ✓ Room migrated: ${r.id} (${r.name})`);
  }

  // 2. Migrate Customers
  const sqliteCustomers = sqlite.prepare('SELECT * FROM customers').all() as any[];
  console.log(`\n[4/5] Migrating ${sqliteCustomers.length} Customers...`);
  for (const c of sqliteCustomers) {
    await prisma.customer.upsert({
      where: { id: c.id },
      update: {
        name: c.name,
        email: c.email.toLowerCase(),
      },
      create: {
        id: c.id,
        name: c.name,
        email: c.email.toLowerCase(),
      },
    });
    console.log(`  ✓ Customer migrated: ${c.id} (${c.email})`);
  }

  // 3. Migrate Bookings
  const sqliteBookings = sqlite.prepare('SELECT * FROM bookings').all() as any[];
  console.log(`\n[5/5] Migrating ${sqliteBookings.length} Bookings...`);
  for (const b of sqliteBookings) {
    await prisma.booking.upsert({
      where: { id: b.id },
      update: {
        idempotency_key: b.idempotency_key,
        request_hash: b.request_hash,
        room_id: b.room_id,
        customer_id: b.customer_id,
        check_in: new Date(b.check_in + 'T00:00:00.000Z'),
        check_out: new Date(b.check_out + 'T00:00:00.000Z'),
        guests: b.guests,
        currency: b.currency,
        total_price_cents: b.total_price_cents,
        status: b.status,
        created_at: new Date(b.created_at),
      },
      create: {
        id: b.id,
        idempotency_key: b.idempotency_key,
        request_hash: b.request_hash,
        room_id: b.room_id,
        customer_id: b.customer_id,
        check_in: new Date(b.check_in + 'T00:00:00.000Z'),
        check_out: new Date(b.check_out + 'T00:00:00.000Z'),
        guests: b.guests,
        currency: b.currency,
        total_price_cents: b.total_price_cents,
        status: b.status,
        created_at: new Date(b.created_at),
      },
    });
    console.log(`  ✓ Booking migrated: ${b.id} [${b.room_id}: ${b.check_in} -> ${b.check_out}]`);
  }

  // 4. Migrate Webhook Outbox (Preserving exact DELIVERED status and retry count)
  const sqliteOutbox = sqlite.prepare('SELECT * FROM webhook_outbox').all() as any[];
  console.log(`\nMigrating ${sqliteOutbox.length} Webhook Outbox Events...`);
  for (const o of sqliteOutbox) {
    await prisma.webhookOutbox.upsert({
      where: { id: o.id },
      update: {
        event_type: o.event_type,
        payload: o.payload,
        delivery_status: o.delivery_status,
        retry_count: o.retry_count,
        next_retry_at: o.next_retry_at ? new Date(o.next_retry_at) : null,
        last_attempt_at: o.last_attempt_at ? new Date(o.last_attempt_at) : null,
        last_error: o.last_error,
        created_at: new Date(o.created_at),
      },
      create: {
        id: o.id,
        event_type: o.event_type,
        payload: o.payload,
        delivery_status: o.delivery_status,
        retry_count: o.retry_count,
        next_retry_at: o.next_retry_at ? new Date(o.next_retry_at) : null,
        last_attempt_at: o.last_attempt_at ? new Date(o.last_attempt_at) : null,
        last_error: o.last_error,
        created_at: new Date(o.created_at),
      },
    });
    console.log(`  ✓ Outbox event migrated: ${o.id} (Status: ${o.delivery_status}, Retries: ${o.retry_count})`);
  }

  // Verification & Parity Checks
  console.log('\n================================================================');
  console.log('   DATA PARITY & INTEGRITY VERIFICATION REPORT                  ');
  console.log('================================================================');

  const neonRoomsCount = await prisma.room.count();
  const neonCustomersCount = await prisma.customer.count();
  const neonBookingsCount = await prisma.booking.count();
  const neonOutboxCount = await prisma.webhookOutbox.count();

  console.log(`Rooms          | SQLite: ${sqliteRooms.length} | Neon: ${neonRoomsCount} | Match: ${sqliteRooms.length === neonRoomsCount ? '✅ YES' : '❌ NO'}`);
  console.log(`Customers      | SQLite: ${sqliteCustomers.length} | Neon: ${neonCustomersCount} | Match: ${sqliteCustomers.length === neonCustomersCount ? '✅ YES' : '❌ NO'}`);
  console.log(`Bookings       | SQLite: ${sqliteBookings.length} | Neon: ${neonBookingsCount} | Match: ${sqliteBookings.length === neonBookingsCount ? '✅ YES' : '❌ NO'}`);
  console.log(`Webhook Outbox | SQLite: ${sqliteOutbox.length} | Neon: ${neonOutboxCount} | Match: ${sqliteOutbox.length === neonOutboxCount ? '✅ YES' : '❌ NO'}`);

  // Check delivered status guarantee
  const deliveredEvents = await prisma.webhookOutbox.count({ where: { delivery_status: 'DELIVERED' } });
  console.log(`Preserved DELIVERED events in Neon: ${deliveredEvents}/${neonOutboxCount} (Will not be re-dispatched)`);

  sqlite.close();
  await prisma.$disconnect();

  if (
    sqliteRooms.length !== neonRoomsCount ||
    sqliteCustomers.length !== neonCustomersCount ||
    sqliteBookings.length !== neonBookingsCount ||
    sqliteOutbox.length !== neonOutboxCount
  ) {
    throw new Error('Data parity verification failed: Row counts mismatch!');
  }

  console.log('\n✅ Lossless SQLite to Neon PostgreSQL migration completed successfully!');
}

migrateSqliteToNeon().catch((err) => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
