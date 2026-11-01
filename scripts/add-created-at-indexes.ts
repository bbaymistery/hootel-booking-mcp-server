import { getPrismaClient, disconnectPrisma } from '../src/db/prisma.ts';

const prisma = getPrismaClient();

async function run() {
  console.log('--- Adding created_at to customers and descending indexes ---');

  // 1. Add created_at column to customers if not exists
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "customers" 
    ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);
  console.log('✓ Added created_at column to customers');

  // 2. Add descending created_at index to bookings
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "idx_bookings_created_at" 
    ON "bookings"("created_at" DESC);
  `);
  console.log('✓ Created index idx_bookings_created_at');

  // 3. Add descending created_at index to customers
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "idx_customers_created_at" 
    ON "customers"("created_at" DESC);
  `);
  console.log('✓ Created index idx_customers_created_at');

  // 4. Add descending created_at index to webhook_outbox
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "idx_webhook_outbox_created_at" 
    ON "webhook_outbox"("created_at" DESC);
  `);
  console.log('✓ Created index idx_webhook_outbox_created_at');

  console.log('--- Migration completed successfully ---');
}

run()
  .catch((e) => {
    console.error('Error running migration:', e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectPrisma();
  });
