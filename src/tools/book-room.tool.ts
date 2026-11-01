import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BookingService } from '../services/booking.service.js';
import { BookRoomInputShape, BookRoomInputSchema } from '../schemas/booking.schema.js';
import { toMcpErrorResponse } from '../errors/app-error.js';

export function registerBookRoomTool(
  server: McpServer,
  bookingService: BookingService = new BookingService()
): void {
  server.tool(
    'book_room',
    'Reserve a specific hotel room for a guest with atomic double-booking prevention, full payload idempotency, and post-commit webhook notification.',
    BookRoomInputShape,
    async (rawArgs): Promise<CallToolResult> => {
      try {
        const validated = BookRoomInputSchema.parse(rawArgs);
        const result = await bookingService.bookRoom(validated);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error: unknown) {
        return toMcpErrorResponse(error);
      }
    }
  );
}
