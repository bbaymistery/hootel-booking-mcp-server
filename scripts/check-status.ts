import { getPrismaClient, disconnectPrisma } from '../src/db/prisma.ts';

const prisma = getPrismaClient();

async function main() {
  const rooms = await prisma.room.findMany({ orderBy: { id: 'asc' } });
  console.log('--- ROOMS IN NEON ---');
  for (const r of rooms) {
    console.log(`[${r.id}] ${r.name} - Capacity: ${r.capacity}, Status: ${r.status}, Price: $${r.price_per_night_cents / 100}`);
  }

  const bookings = await prisma.booking.findMany({
    include: { room: true },
    orderBy: { created_at: 'desc' },
  });
  console.log(`\n--- BOOKINGS IN NEON (${bookings.length}) ---`);
  for (const b of bookings) {
    console.log(`[${b.id}] Room: ${b.room.name} (${b.room_id}) | Dates: ${b.check_in.toISOString().split('T')[0]} to ${b.check_out.toISOString().split('T')[0]} | Status: ${b.status}`);
  }
}

main().catch(console.error).finally(() => disconnectPrisma());
