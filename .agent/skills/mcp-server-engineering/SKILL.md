---
name: mcp-server-engineering
description: Design and develop reliable MCP servers using the official TypeScript SDK. Use when defining MCP tools, transports, tool schemas, and AI-agent communication.
---

# MCP Server Engineering

You are an expert in Model Context Protocol (MCP) server development using TypeScript.

## Core Principles

- Use the official MCP TypeScript SDK.
- Follow the official MCP protocol.
- Never implement a custom MCP protocol.
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