import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../db/prisma.js';
import { createLocalMcpClient, type McpClientBundle } from './mcp-client.service.js';
import { AppError } from '../errors/app-error.js';

export interface ChatHistoryTurn {
  role: 'user' | 'model';
  content: string;
}

export interface ChatServiceRequest {
  message: string;
  history?: ChatHistoryTurn[] | undefined;
  model?: string | undefined;
}

export interface ChatExecutedToolCall {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  isError: boolean;
}

export interface ChatServiceResponse {
  reply: string;
  toolCalls: ChatExecutedToolCall[];
  booking?: Record<string, unknown> | null | undefined;
  history: ChatHistoryTurn[];
}

export interface GenAiClientInterface {
  models: {
    generateContent: (params: any) => Promise<any>;
  };
}

export class GeminiChatService {
  private readonly prisma: PrismaClient;
  private readonly aiClient?: GenAiClientInterface | undefined;
  private readonly modelName: string;
  private mcpBundle?: McpClientBundle | undefined;

  constructor(options: {
    prisma?: PrismaClient | undefined;
    aiClient?: GenAiClientInterface | undefined;
    modelName?: string | undefined;
    mcpBundle?: McpClientBundle | undefined;
  } = {}) {
    this.prisma = options.prisma ?? getPrismaClient();
    try {
      process.loadEnvFile?.();
    } catch {}
    this.modelName = options.modelName ?? process.env['GEMINI_MODEL'] ?? 'gemini-3.8-flash';
    this.mcpBundle = options.mcpBundle;

    if (options.aiClient) {
      this.aiClient = options.aiClient;
    } else {
      const apiKey = process.env['GEMINI_API_KEY'];
      if (apiKey && apiKey !== 'your_gemini_api_key' && apiKey.trim().length > 0) {
        this.aiClient = new GoogleGenAI({ apiKey });
      }
    }
  }

  public async getMcpBundle(): Promise<McpClientBundle> {
    if (!this.mcpBundle) {
      this.mcpBundle = await createLocalMcpClient(this.prisma);
    }
    return this.mcpBundle;
  }

  public getSystemInstruction(): string {
    const today = new Date().toISOString().split('T')[0] ?? '2026-11-01';
    return `You are the AI Concierge for Grand Horizon Hotel, a luxury 5-star oceanfront resort.
Your persona is warm, polite, highly professional, elegant, and attentive.
Current date: ${today}. All dates MUST strictly adhere to YYYY-MM-DD format.

HOTEL OVERVIEW & AMENITIES:
- Location: Grand Horizon Oceanfront Resort & Spa, Coastal Highway 101.
- Amenities: Private white-sand beachfront, Michelin-starred fine dining, rooftop infinity pool, 24/7 luxury wellness spa & fitness center, complimentary gourmet breakfast, private airport transfer.
- Room catalog:
  * Deluxe Ocean View King (room_deluxe_101): 1 King bed, oceanfront terrace, max 2 guests ($220/night).
  * Standard Double Queen (room_queen_102): 2 Queen beds, partial sea/garden view, max 4 guests ($160/night).
  * Presidential Penthouse Suite (room_suite_201): 2 King beds + salon, 360° panoramic terrace, max 6 guests ($550/night).
  * Single Urban Studio (room_cozy_301): 1 Queen bed, executive workstation, max 1 guest ($110/night).

CAPABILITIES & REAL MCP TOOL USAGE:
- You have access to real tools provided by the Hotel Booking MCP Server:
  1. \`check_availability\`: Checks vacant rooms and calculates total pricing for the requested date interval and guest count.
  2. \`book_room\`: Confirms and creates a real reservation in the database.

CRITICAL BOOKING & RESERVATION RULES:
1. When a user asks about dates, vacant rooms, prices, or recommendations, ALWAYS call \`check_availability\`.
2. Do not invent or hallucinate room availability or prices. Always present the real results returned by the tool.
3. Before calling \`book_room\`, you MUST collect ALL of the following details:
   - Specific Room ID (e.g. room_deluxe_101)
   - Guest Full Name
   - Guest Email Address
   - Check-in Date (YYYY-MM-DD)
   - Check-out Date (YYYY-MM-DD)
   - Number of Guests
4. MANDATORY EXPLICIT CONFIRMATION RULE:
   You are STRICTLY FORBIDDEN from calling \`book_room\` without prior explicit confirmation from the guest.
   Before making the booking, present a complete booking summary:
     • Room: [Room Name] ([Room ID])
     • Dates: [Check-in] to [Check-out] ([N] nights)
     • Guests: [Guest count]
     • Total Price: $[Total Price]
     • Guest: [Full Name] ([Email])
   Then explicitly ask: "Would you like me to go ahead and confirm this booking for you?"
5. ONLY when the user explicitly agrees (e.g., "Yes", "Please confirm", "Go ahead", "Təsdiq edirəm"), call \`book_room\`.
6. When calling \`book_room\`, generate a unique idempotency_key (format: chat_bkg_<timestamp>_<random>).
7. When \`book_room\` succeeds, warmly congratulate the guest. Present their official confirmation details cleanly with clear bullets:
   * **Booking Reference ID:** \`booking_id\`
   * **Confirmed Room:** [Room Name]
   * **Dates:** [Check-in] to [Check-out] ([N] nights)
   * **Total Amount:** $[Total Price] USD
   Clearly state: "A confirmation email will be sent to [Email] shortly."
8. When reporting availability, if requested dates for a room are unavailable, use the tool's \`unavailable_rooms\` data:
   * State clearly which rooms ARE available for the requested dates with their rates.
   * If a room is booked, explain when it becomes available (e.g., "Standard Double Queen is currently reserved until November 28, 2026, but is available starting Nov 28!").
   * If a room exceeds capacity (e.g., Single Urban Studio max 1 guest), mention the guest limit.
   * If in maintenance (Executive Suite), explain that it is undergoing luxury scheduled renovation.`;
  }

  public async sendMessage(request: ChatServiceRequest): Promise<ChatServiceResponse> {
    const userMessage = request.message?.trim();
    if (!userMessage) {
      throw AppError.invalidInput('Message cannot be empty');
    }

    if (!this.aiClient) {
      return {
        reply: '⚠️ **Gemini API Key Required**\n\nThe Google Gemini API key (`GEMINI_API_KEY`) is not configured in your server `.env` file.\n\nPlease add your valid Gemini API key (`GEMINI_API_KEY=AIzaSy...`) to the `.env` file and restart the server.',
        toolCalls: [],
        booking: null,
        history: [
          ...(request.history ?? []),
          { role: 'user', content: userMessage },
          { role: 'model', content: 'Gemini API key is not configured.' },
        ],
      };
    }

    const mcpBundle = await this.getMcpBundle();
    const mcpTools = await mcpBundle.listTools();

    // Map MCP tools to Gemini function declarations
    const functionDeclarations = mcpTools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? '',
      parameters: tool.inputSchema,
    }));

    // Build conversation contents
    const contents: any[] = [];

    // Append past history turns
    if (request.history && request.history.length > 0) {
      for (const turn of request.history) {
        contents.push({
          role: turn.role === 'model' ? 'model' : 'user',
          parts: [{ text: turn.content }],
        });
      }
    }

    // Append current user message
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }],
    });

    const activeModel = request.model?.trim() || this.modelName;
    const executedToolCalls: ChatExecutedToolCall[] = [];
    let bookingResult: Record<string, unknown> | null = null;
    let finalAssistantReply = '';

    try {
      // Multi-turn tool execution loop (max 5 iterations)
      for (let iteration = 0; iteration < 5; iteration++) {
        const response = await this.aiClient.models.generateContent({
          model: activeModel,
          contents,
          config: {
            systemInstruction: this.getSystemInstruction(),
            tools: [{ functionDeclarations }],
          },
        });

      // Check if candidate parts have function calls
      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const functionCalls: any[] = [];

      for (const part of parts) {
        if (part.functionCall) {
          functionCalls.push(part.functionCall);
        }
      }

      if (functionCalls.length === 0) {
        // No more tool calls; extract final assistant text
        finalAssistantReply = response.text || '';
        break;
      }

      // Append model's tool call turn to contents
      contents.push(candidate.content);

      // Execute each tool call through the genuine MCP client
      const functionResponseParts: any[] = [];

      for (const fc of functionCalls) {
        const toolName = fc.name;
        const toolArgs = fc.args ?? {};

        let toolResultParsed: Record<string, unknown> = {};
        let isError = false;

        try {
          const toolExecResult = await mcpBundle.callTool(toolName, toolArgs);
          isError = !!toolExecResult.isError;
          const textContent = toolExecResult.content.find((c) => c.type === 'text')?.text ?? '{}';

          try {
            toolResultParsed = JSON.parse(textContent);
          } catch {
            toolResultParsed = { raw: textContent };
          }

          if (toolName === 'book_room' && !isError && toolResultParsed.booking_id) {
            bookingResult = toolResultParsed;
          }
        } catch (error: any) {
          isError = true;
          toolResultParsed = {
            error: error?.message || 'Tool execution failed',
            code: error?.code || 'TOOL_ERROR',
          };
        }

        executedToolCalls.push({
          name: toolName,
          args: toolArgs,
          result: toolResultParsed,
          isError,
        });

        functionResponseParts.push({
          functionResponse: {
            name: toolName,
            response: toolResultParsed,
          },
        });
      }

      // Append function response turn to contents
      contents.push({
        role: 'user',
        parts: functionResponseParts,
      });
    }

    const updatedHistory: ChatHistoryTurn[] = [
      ...(request.history ?? []),
      { role: 'user', content: userMessage },
      { role: 'model', content: finalAssistantReply },
    ];

    return {
      reply: finalAssistantReply,
      toolCalls: executedToolCalls,
      booking: bookingResult,
      history: updatedHistory,
    };
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    const isQuota =
      errorMsg.includes('429') ||
      errorMsg.includes('quota') ||
      errorMsg.includes('RESOURCE_EXHAUSTED');

    if (isQuota) {
      return {
        reply: `⚠️ **Daily Quota Limit Reached on ${activeModel}**\n\nGoogle's daily request limit for model \`${activeModel}\` has been reached on the Free Tier.\n\n👉 **Please switch to another model** (e.g. **Gemini 3.8 Flash** or **Gemini 3.6 Flash**) using the Model Selector dropdown in the header above and continue!`,
        toolCalls: [],
        booking: null,
        history: request.history ?? [],
      };
    }
    throw error;
  }
}
}
