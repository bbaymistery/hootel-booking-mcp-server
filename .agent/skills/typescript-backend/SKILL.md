---
name: mcp-server-engineering
description: Design and develop reliable MCP servers using the official TypeScript SDK. Use when defining MCP tools, transports, tool schemas, and AI-agent communication.
---

# MCP Server Engineering

You are an expert in Model Context Protocol (MCP) server development using TypeScript.

## Core Principles

- Use the official MCP TypeScript SDK.
- Follow the official MCP protocol.
- Never implement a custom ---
name: typescript-backend-engineering
description: Design modular TypeScript backend systems with clean services, SQLite persistence, validation, transactions, and error handling.
---

# TypeScript Backend Engineering

You are a senior backend engineer specializing in Node.js and TypeScript.

## Core Principles

- Use TypeScript strict mode.
- Never use `any`.
- Prefer explicit types and interfaces.
- Keep responsibilities separated.
- Avoid unnecessary abstractions.
- Write readable, maintainable code.
- Use dependency injection where it improves testability.

## Project Architecture

Separate responsibilities into:

- Controllers or MCP handlers
- Business logic services
- Database repositories
- Models and types
- Validation schemas
- Webhook services

Do not mix database queries with MCP tool definitions.

## Database

Use SQLite for local persistence.

Define appropriate:

- Primary keys
- Foreign keys
- Unique constraints
- NOT NULL constraints
- Indexes

## Booking Logic

The Booking Service must:

1. Validate booking information.
2. Verify that the room exists.
3. Check room capacity.
4. Check date overlaps.
5. Prevent double booking.
6. Create bookings safely inside a database transaction.

The transaction must handle concurrency correctly.

Use SQLite transaction and locking capabilities appropriately. Do not rely only on an application-level availability check.

## Webhooks

Generate booking.created only after a successful database commit.

Distinguish between:

- Event creation
- Event persistence
- External webhook delivery

A failed booking must never generate a successful booking event.

## Error Handling

Use predictable, typed errors.

Handle:

- Invalid input
- Missing records
- Unavailable rooms
- Capacity errors
- Database failures
- Transaction failures

## Code Quality

Prefer small, focused functions.

Avoid duplicated logic.

Write code that is easy to test and explain during a technical interview.MCP protocol.
- Use TypeScript strict mode.
- Never use `any`.
- Use Zod for input validation.
- Keep MCP transport and business logic separate.

## MCP Communication

Understand and correctly implement:

- tools/list
- tools/call
- Tool registration
- Tool descriptions
- Input schemas
- Structured tool responses
- Error responses

## Hotel Booking MCP Tools

The project must expose:

1. check_availability
2. book_room

Each tool must have:

- A clear description for AI agents.
- A strictly validated input schema.
- Predictable output.
- Meaningful error handling.

## Architecture

Separate:

- MCP server initialization
- Transport configuration
- Tool definitions
- Input validation
- Business logic services

The MCP layer must never contain database business logic directly.

## Important

Do not invent SDK APIs.

Verify SDK usage against the installed official package documentation and examples.

Prioritize correctness, simplicity, and reliable communication between the AI agent and MCP server.