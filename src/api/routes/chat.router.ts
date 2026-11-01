import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { GeminiChatService } from '../../services/gemini-chat.service.js';
import { AppError } from '../../errors/app-error.js';

const chatMessageSchema = z.object({
  message: z.string().trim().min(1, 'Message is required').max(3000, 'Message too long'),
  model: z.string().trim().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'model']),
        content: z.string(),
      })
    )
    .optional(),
});

export function createChatRouter(chatService: GeminiChatService): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = chatMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.invalidInput('Invalid chat payload', {
          issues: parsed.error.issues,
        });
      }

      const result = await chatService.sendMessage({
        message: parsed.data.message,
        history: parsed.data.history,
        model: parsed.data.model,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
