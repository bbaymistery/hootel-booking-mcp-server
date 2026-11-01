---
name: developer-workflow
description: Applies disciplined software engineering practices including planning, user approval, implementation, testing, code review, and documentation across software projects.
---

# Developer Workflow

## 1. Understand Before Acting
- Inspect the existing project before making assumptions.
- Understand the requirements and identify missing information.
- Do not make unnecessary architectural decisions.

## 2. Planning First
- For substantial tasks, use Planning Mode.
- Create a clear implementation plan.
- Break work into small, verifiable tasks.
- Present plans and task lists as Antigravity Artifacts.
- Explain important architectural decisions and trade-offs.

## 3. Explicit User Approval
- Never implement before explicit user approval.
- Never create, modify, or delete project files before approval.
- Never install dependencies or run initialization commands before approval.
- The exact approval keyword for this project is defined by the user.
- If approval is missing, stop after planning.
- If the user requests changes, update the plan and wait again.

## 4. Implementation
After approval:
- Follow the approved plan.
- Make small, focused changes.
- Follow existing project conventions.
- Avoid unnecessary dependencies and abstractions.
- Never use `any` in TypeScript.
- Never invent APIs or claim unverified functionality.

## 5. Testing and Verification
- Run relevant tests and checks.
- Verify actual command results.
- Never claim something works without verification.
- Report failures honestly.

## 6. Code Review
Review:
- Correctness
- Security
- Maintainability
- Performance
- Error handling
- Test coverage

## 7. Artifacts and Documentation
- Present implementation plans and task lists as Artifacts.
- Use code diffs for review.
- After implementation, create a Walkthrough Artifact.
- Explain what changed, why it changed, and how to test it.
- Do not claim completion before verification.