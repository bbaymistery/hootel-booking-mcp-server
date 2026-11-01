import { getPrismaClient, disconnectPrisma } from '../src/db/prisma.js';

async function main() {
  const prisma = getPrismaClient();
  const rooms = await prisma.room.findMany({
    orderBy: { price_per_night_cents: 'asc' },
  });

  console.log(`=== NEON POSTGRESQL ROOMS (${rooms.length} TOTAL) ===`);
  for (const r of rooms) {
    console.log(`• [${r.id}] ${r.name}`);
    console.log(`   Capacity: ${r.capacity} guests | Price: $${(r.price_per_night_cents / 100).toFixed(2)}/night | Status: ${r.status}`);
  }

  const bookingsCount = await prisma.booking.count();
  const customersCount = await prisma.customer.count();
  console.log(`\n• Total Bookings in Neon: ${bookingsCount}`);
  console.log(`• Total Customers in Neon: ${customersCount}`);

  await disconnectPrisma();
}

main().catch(console.error);
