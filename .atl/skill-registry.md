# Skill Registry — gutgut-backend

> Generated: 2026-04-15
> Project: gutgut-backend

## User-Level Skills

| Skill | Trigger | Location |
|-------|---------|----------|
| `skill-creator` | Create a new skill, add agent instructions, document patterns for AI | `~/.config/opencode/skills/skill-creator/` |
| `branch-pr` | Create a pull request, open a PR, prepare changes for review | `~/.config/opencode/skills/branch-pr/` |
| `issue-creation` | Create a GitHub issue, report a bug, request a feature | `~/.config/opencode/skills/issue-creation/` |
| `go-testing` | Write Go tests, use teatest, add test coverage | `~/.config/opencode/skills/go-testing/` |
| `judgment-day` | "judgment day", "judgment-day", "review adversarial", "dual review", "juzgar" | `~/.config/opencode/skills/judgment-day/` |
| `context7-mcp` | Questions about libraries, frameworks, API references, code examples | `~/.agents/skills/context7-mcp/` |
| `playwright-cli` | Navigate websites, interact with web pages, fill forms, take screenshots | `~/.agents/skills/playwright-cli/` |
| `find-skills` | "how do I do X", "find a skill for X", "is there a skill that can..." | `~/.agents/skills/find-skills/` |
| `dev` | Rolling dependencies, releasing, repo maintenance (playwright-cli repo) | `~/.agents/skills/dev/` |

## SDD Skills (Orchestrator-triggered)

| Skill | Trigger | Phase |
|-------|---------|-------|
| `sdd-init` | Initialize SDD context, "sdd init", "iniciar sdd" | Init |
| `sdd-explore` | Explore ideas, investigate codebase, clarify requirements | Explore |
| `sdd-propose` | Create change proposal with intent, scope, approach | Propose |
| `sdd-spec` | Write specifications with requirements and scenarios | Spec |
| `sdd-design` | Create technical design document with architecture decisions | Design |
| `sdd-tasks` | Break down change into implementation task checklist | Tasks |
| `sdd-apply` | Implement tasks from the change | Apply |
| `sdd-verify` | Validate implementation matches specs, design, tasks | Verify |
| `sdd-archive` | Sync delta specs to main specs, archive completed change | Archive |

## Project Conventions

| File | Type | Description |
|------|------|-------------|
| `AGENTS.md` | Index | Project-level instructions for AI agents |
| No `.cursorrules`, `CLAUDE.md`, `GEMINI.md` | — | No additional agent config files |

## Stack-Relevant Skills

Based on the project stack (Node.js, Express, MongoDB, Firebird, Zod):

| Recommended Skill | Why |
|-------------------|-----|
| `context7-mcp` | For Express, MongoDB, Zod API documentation |
| `branch-pr` | When creating PRs for changes |
| `issue-creation` | When filing bugs or feature requests |

> **Note**: `go-testing` is NOT relevant for this Node.js project.