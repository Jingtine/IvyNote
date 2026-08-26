# Local Knowledge IDE

Local-first, open-format personal knowledge workbench. Edit real local Markdown / LaTeX files; no proprietary storage, no vendor lock-in, no silent data loss.

## Authoritative Documents

- **Master Specification (read this first):** `docs/PROJECT_MASTER_SPEC.md`
  Product spec, architecture constraints, development rules, milestones, quality gates, and Agent behavior rules.
- **Current milestone plan:** `docs/plans/v0.1-foundation.md`
  The active implementation plan. Tasks use checkbox syntax and each ends in a testable deliverable and a focused commit.

## Agent Primary Directives

1. Read `docs/PROJECT_MASTER_SPEC.md` before modifying the project.
2. Confirm the current milestone; implement only what that milestone allows (YAGNI).
3. Local files are the source of truth. Markdown/TeX must remain open, portable formats.
4. No silent overwrites, no silent reformatting of user files, encoding, line endings, or links.
5. All file writes consider external-modification conflict and atomic save.
6. Use TDD: failing test first, minimal implementation, then verify.
7. Never claim completion without running the verification commands (`pnpm verify`).
8. Follow the decision priority in the Master Spec when constraints conflict.
