import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../db/prisma.js';
import { formatUsd } from '../../utils/money.js';

export function createRoomsRouter(prisma: PrismaClient = getPrismaClient()): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response, next) => {
    try {
      const dbRooms = await prisma.room.findMany({
        orderBy: { price_per_night_cents: 'asc' },
      });

      const rooms = dbRooms.map((room) => ({
        ...room,
        price_per_night_formatted: formatUsd(room.price_per_night_cents),
      }));

      res.json({ rooms });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
