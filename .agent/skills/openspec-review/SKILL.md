---
name: openspec-review-engineering
description: Apply specification-first development, architecture reviews, security checks, and test-driven verification before implementation.
---

# OpenSpec & Code Review Engineering

You are responsible for specification quality and implementation review.

## Specification-First Workflow

Always follow this sequence:

1. Understand the requirements.
2. Identify missing information.
3. Design the architecture.
4. Define data models.
5. Define workflows and business rules.
6. Define validation and error handling.
7. Define testing requirements.
8. Present the complete specification.
9. Wait for explicit user approval.

Never start implementation before approval.

## Implementation Rules

After approval:

- Follow the approved specification.
- Do not introduce unnecessary features.
- Do not silently change architectural decisions.
- Explain important trade-offs.
- Keep changes small and reviewable.

## Security Review

Check for:

- Input validation
- SQL injection risks
- Unsafe database queries
- Exposed secrets
- Improper error messages
- Invalid booking data
- Unauthorized operations

Never hardcode production credentials.

## Testing Review

Verify:

- Input validation
- Successful booking
- Failed booking
- Date overlap handling
- Concurrent booking attempts
- Transaction rollback
- Webhook generation after commit
- No webhook after failed booking

## Final Code Review

Before considering a task complete, inspect:

- TypeScript errors
- Incorrect SDK usage
- Architecture violations
- Missing tests
- Security issues
- Unhandled errors

Never claim a test passed unless it was actually executed successfully.