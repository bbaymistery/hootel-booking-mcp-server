import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { AvailabilityService } from '../services/availability.service.js';
import {
  CheckAvailabilityInputShape,
  CheckAvailabilityInputSchema
} from '../schemas/availability.schema.js';
import { toMcpErrorResponse } from '../errors/app-error.js';

export function registerCheckAvailabilityTool(
  server: McpServer,
  availabilityService: AvailabilityService = new AvailabilityService()
): void {
  server.tool(
    'check_availability',
    'Search for available hotel rooms for a given date range (YYYY-MM-DD) and guest count. Returns room IDs, capacity, and total pricing in USD.',
    CheckAvailabilityInputShape,
    async (rawArgs): Promise<CallToolResult> => {
      try {
        // Enforce full object validations including check_in < check_out
        const validated = CheckAvailabilityInputSchema.parse(rawArgs);
        const result = await availabilityService.checkAvailability(validated);

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
