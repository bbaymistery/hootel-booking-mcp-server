import { Router, type Request, type Response, type NextFunction } from 'express';
import { AvailabilityService } from '../../services/availability.service.js';
import { CheckAvailabilityInputSchema } from '../../schemas/availability.schema.js';

export function createAvailabilityRouter(
  availabilityService: AvailabilityService = new AvailabilityService()
): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { check_in, check_out, guests } = req.query;

      const guestsNum = guests !== undefined ? Number(guests) : NaN;

      const validated = CheckAvailabilityInputSchema.parse({
        check_in,
        check_out,
        guests: guestsNum
      });

      const result = await availabilityService.checkAvailability(validated);
      res.json(result);
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
