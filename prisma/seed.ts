import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

export const INITIAL_ROOMS = [
  {
    id: 'room_deluxe_101',
    name: 'Deluxe Ocean View King',
    capacity: 2,
    price_per_night_cents: 22000,
    status: 'AVAILABLE' as const,
  },
  {
    id: 'room_queen_102',
    name: 'Standard Double Queen',
    capacity: 4,
    price_per_night_cents: 16000,
    status: 'AVAILABLE' as const,
  },
  {
    id: 'room_suite_201',
    name: 'Presidential Penthouse Suite',
    capacity: 6,
    price_per_night_cents: 55000,
    status: 'AVAILABLE' as const,
  },
  {
    id: 'room_cozy_301',
    name: 'Single Urban Studio',
    capacity: 1,
    price_per_night_cents: 11000,
    status: 'AVAILABLE' as const,
  },
  {
    id: 'room_maint_901',
    name: 'Executive Suite (Maintenance Underway)',
    capacity: 4,
    price_per_night_cents: 30000,
    status: 'MAINTENANCE' as const,
  },
];

export async function seedNeonRooms(prismaClient?: PrismaClient) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set.');
  }

  const prisma = prismaClient ?? new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  console.log('[Seed] Seeding initial room catalog into Neon PostgreSQL idempotently...');
  for (const room of INITIAL_ROOMS) {
    await prisma.room.upsert({
      where: { id: room.id },
      update: {
        name: room.name,
        capacity: room.capacity,
        price_per_night_cents: room.price_per_night_cents,
        status: room.status,
      },
      create: room,
    });
    console.log(`  ✓ Upserted room: ${room.id} (${room.name})`);
  }

  console.log('[Seed] All rooms verified in Neon PostgreSQL.');
  if (!prismaClient) {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedNeonRooms().catch((err) => {
    console.error('[Seed Error]', err);
    process.exit(1);
  });
}
