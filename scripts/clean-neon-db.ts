import { getPrismaClient, disconnectPrisma } from '../src/db/prisma.ts';

const prisma = getPrismaClient();

async function cleanNeonDb() {
  console.log('--- Cleaning Neon PostgreSQL Database ---');

  // 1. Delete all bookings
  const deletedBookings = await prisma.booking.deleteMany({});
  console.log(`Deleted bookings: ${deletedBookings.count}`);

  // 2. Delete all webhook_outbox
  const deletedWebhooks = await prisma.webhookOutbox.deleteMany({});
  console.log(`Deleted webhook_outbox: ${deletedWebhooks.count}`);

  // 3. Delete customers
  const deletedCustomers = await prisma.customer.deleteMany({});
  console.log(`Deleted customers: ${deletedCustomers.count}`);

  // 4. Verify rooms remain intact
  const rooms = await prisma.room.findMany({ orderBy: { id: 'asc' } });
  console.log(`Remaining rooms count: ${rooms.length}`);
  rooms.forEach((r) => {
    console.log(` - [${r.id}] ${r.name} (${r.status}, capacity: ${r.capacity}, $${r.price_per_night_cents / 100})`);
  });

  const remainingBookings = await prisma.booking.count();
  const remainingWebhooks = await prisma.webhookOutbox.count();
  const remainingCustomers = await prisma.customer.count();

  console.log('--- Current DB State ---');
  console.log({
    bookings: remainingBookings,
    webhook_outbox: remainingWebhooks,
    customers: remainingCustomers,
    rooms: rooms.length,
  });
}

cleanNeonDb()
  .catch((e) => {
    console.error('Clean error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectPrisma();
  });
