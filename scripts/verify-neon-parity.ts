import Database from 'better-sqlite3';
import { getPrismaClient, disconnectPrisma } from '../src/db/prisma.js';

async function verifyParity() {
  const sqlite = new Database('hotel_booking.db', { readonly: true });
  const prisma = getPrismaClient();

  const sqliteRooms = (sqlite.prepare('SELECT count(*) as count FROM rooms').get() as any).count;
  const neonRooms = await prisma.room.count();

  const sqliteCustomers = (sqlite.prepare('SELECT count(*) as count FROM customers').get() as any).count;
  const neonCustomers = await prisma.customer.count();

  const sqliteBookings = (sqlite.prepare('SELECT count(*) as count FROM bookings').get() as any).count;
  const neonBookings = await prisma.booking.count();

  const sqliteOutbox = (sqlite.prepare('SELECT count(*) as count FROM webhook_outbox').get() as any).count;
  const neonOutbox = await prisma.webhookOutbox.count();

  console.log('=== DATA PARITY REPORT ===');
  console.log(`Rooms:          SQLite = ${sqliteRooms}, Neon = ${neonRooms}`);
  console.log(`Customers:      SQLite = ${sqliteCustomers}, Neon = ${neonCustomers}`);
  console.log(`Bookings:       SQLite = ${sqliteBookings}, Neon = ${neonBookings}`);
  console.log(`Webhook Outbox: SQLite = ${sqliteOutbox}, Neon = ${neonOutbox}`);

  sqlite.close();
  await disconnectPrisma();
}

verifyParity().catch(console.error);
