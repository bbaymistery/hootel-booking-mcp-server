import type Database from 'better-sqlite3';
import { getDb } from './connection.js';
import { runMigrations } from './migrate.js';

export function seedRooms(db: Database.Database = getDb()): void {
  const insertRoom = db.prepare(`
    INSERT OR REPLACE INTO rooms (id, name, capacity, price_per_night_cents, status)
    VALUES (:id, :name, :capacity, :price_per_night_cents, :status)
  `);

  const rooms = [
    {
      id: 'room_deluxe_101',
      name: 'Deluxe Ocean View King',
      capacity: 2,
      price_per_night_cents: 22000,
      status: 'AVAILABLE'
    },
    {
      id: 'room_queen_102',
      name: 'Standard Double Queen',
      capacity: 4,
      price_per_night_cents: 16000,
      status: 'AVAILABLE'
    },
    {
      id: 'room_suite_201',
      name: 'Presidential Penthouse Suite',
      capacity: 6,
      price_per_night_cents: 55000,
      status: 'AVAILABLE'
    },
    {
      id: 'room_cozy_301',
      name: 'Single Urban Studio',
      capacity: 1,
      price_per_night_cents: 11000,
      status: 'AVAILABLE'
    },
    {
      id: 'room_maint_901',
      name: 'Executive Suite (Maintenance Underway)',
      capacity: 4,
      price_per_night_cents: 30000,
      status: 'MAINTENANCE'
    }
  ];

  const seedTransaction = db.transaction(() => {
    for (const room of rooms) {
      insertRoom.run(room);
    }
  });

  seedTransaction();
}

// Standalone execution support
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  try {
    const db = getDb();
    runMigrations(db);
    seedRooms(db);
    console.error('[Seed] Database seeded with rooms successfully.');
  } catch (error: unknown) {
    console.error('[Seed Error]', error);
    process.exit(1);
  }
}
