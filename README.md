<p align="center">
  <img src="assets/logo.png" alt="MCPify" width="720" />
</p>

<p align="center">
  <strong>Compile software into AI-operable systems.</strong>
</p>

<p align="center">
  MCPify is the AI Enablement Compiler. Transform applications, APIs, frontends, workflows, and databases into AI-native systems for autonomous agents.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/mcpify-cli">
    <img src="https://img.shields.io/npm/v/mcpify-cli?color=FCD269" alt="npm version" />
  </a>
  <a href="https://github.com/amarnath3003/MCPify/actions">
    <img src="https://img.shields.io/badge/build-passing-FF8383?logo=github" alt="build status" />
  </a>
  <a href="https://www.npmjs.com/package/mcpify-cli">
    <img src="https://img.shields.io/npm/dm/mcpify-cli?color=9A72DE" alt="npm downloads" />
  </a>
  <a href="https://www.npmjs.com/package/mcpify-cli">
    <img src="https://img.shields.io/node/v/mcpify-cli?color=4FA2FB" alt="node version" />
  </a>
  <a href="https://www.npmjs.com/package/mcpify-cli">
    <img src="https://img.shields.io/npm/l/mcpify-cli?color=8DE344" alt="license" />
  </a>
  <a href="https://github.com/amarnath3003/MCPify/stargazers">
    <img src="https://img.shields.io/github/stars/amarnath3003/MCPify?color=FC9D59" alt="stars" />
  </a>
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#features">Features</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#cli">CLI</a> ·
  <a href="#architecture">Architecture</a>
</p>

---

<p align="center">
  <img src="https://github.com/amarnath3003/MCPify/raw/main/assets/recgif.gif" 
       width="1080" 
       alt="Demo recording" />
</p>

---

## Overview

### Problem Statement

Modern software is built for humans, not agents. The useful actions are scattered across frontend interactions, backend services, APIs, databases, and workflows, which forces AI systems into brittle browser automation or hand-written MCP boilerplate.

- manual MCP tool authoring for capabilities that already exist
- brittle browser automation for UI interactions
- raw endpoints instead of meaningful workflows
- permission and safety gaps at the tool boundary
- schema and tool drift as the application changes

### Solution

MCPify acts as a compiler for your application. It scans the parts of the codebase that matter to agents and produces a runnable MCP server, semantic workflows, permission-aware tools, and the metadata an agent needs to use them safely.

Stop hand-writing MCP tools. Compile your stack once. Stay in sync forever.

### Codex Usage

Codex is a natural fit for MCPify in a few ways:

1. **Ideate** - use Codex to explore agent workflows, sketch MCP surfaces, and refine how a product should be exposed to AI.
2. **Build** - use Codex to implement or extend the compiler, generators, analyzers, and demo apps in this repo.
3. **Run as MCP inside Codex** - connect the generated MCP server so Codex can call real tools, inspect app surfaces, and operate against the compiled environment.

## Features
- **Backend Analyzer:** Deep AST analysis of routes, controllers, and services to surface every callable action. Framework-aware for Express, Fastify, NestJS, and Next.js — including inline, non-exported handlers.
- **Frontend Action Extraction:** React, Vue, Svelte components mapped to agent-controllable actions.
- **OpenAPI → MCP:** Drop in a spec, ship a typed MCP server in seconds.
- **Workflow Engine:** Multi-step processes detected and exposed as atomic agent capabilities.
- **Permission Layer:** Scopes, roles, and audit trails enforced at the tool boundary.
- **AI Metadata Enhancement:** Auto-generated descriptions, hints, and examples agents actually understand.
- **Database Intelligence:** Schemas, relations, and constraints become safe, queryable surfaces.
- **Event System Integration:** Webhooks, queues, and pub/sub plugged into agent loops.
- **Knowledge Graph Engine:** Entities, intents, and relations modeled across your stack.
- **Self-Updating Sync:** MCP definitions regenerate on every commit. No drift.
- **AI Simulations:** Run agents against your app in a sandbox before shipping.

## Getting Started

The easiest way to use MCPify is via `npx`. No installation required:

```bash
npx mcpify-cli analyze ./my-app
```

To run it against the flagship ecommerce example in this repo:

```bash
npx mcpify-cli analyze ./examples/ecommerce-saas \
  --output ./examples/ecommerce-saas/.mcpify \
  --prisma ./examples/ecommerce-saas/prisma/schema.prisma \
  --swagger ./examples/ecommerce-saas/openapi.json
```

Alternatively, to build from source:

```bash
git clone https://github.com/amarnath3003/MCPify.git
cd MCPify
npm install
npm run build
npm run mcpify -- analyze ./examples/ecommerce-saas \
  --output ./examples/ecommerce-saas/.mcpify \
  --prisma ./examples/ecommerce-saas/prisma/schema.prisma \
  --swagger ./examples/ecommerce-saas/openapi.json
```

After generation:

```bash
cd examples/ecommerce-saas/.mcpify
npm install
npm run build
```

The generated `AGENTS.md` explains how to connect the compiled server to an MCP client. The ecommerce walkthrough lives in `examples/ecommerce-saas/DEMO.md`.

## CLI

### `analyze [path]`

Default command. Runs the full pipeline:
- backend analysis
- optional OpenAPI, Prisma, Drizzle, and Mongoose analysis
- event and webhook discovery
- optional frontend extraction
- workflow detection
- permission classification
- MCP server generation

```bash
npx mcpify-cli analyze . \
  --swagger ./tests/fixtures/swagger/petstore.yaml \
  --prisma ./tests/fixtures/prisma/simple.prisma \
  --watch
```

Useful flags:
- `--output <dir>` change output directory (default: `./.mcpify`)
- `--no-frontend` skip UI action extraction
- `--no-events` skip webhook and listener analysis
- `--no-workflows` skip workflow detection
- `--reachable-only` emit only externally-reachable backend actions (skip internal helpers)
- `--ai-enhance` improve tool descriptions (requires `ANTHROPIC_API_KEY`)
- `--swagger <file>` analyze an OpenAPI/Swagger spec
- `--prisma <file>` analyze a Prisma schema file
- `--drizzle <path>` analyze Drizzle table definitions
- `--mongoose <path>` analyze Mongoose schema/model files
- `--no-install` skip auto-registration into AI clients
- `--clients <list>` clients to register: `codex`, `claude-code`, `claude-desktop`, `vscode`, or `all` (default: `all`)

### `interactive`

Prompts for which analyzers to run and which source files to include.

```bash
npx mcpify-cli interactive
```

### `frontend [path]`

Extracts UI actions only and can print raw JSON.

```bash
npx mcpify-cli frontend ./examples/internal-tool --json
```

### `swagger <file>`

Converts an OpenAPI or Swagger spec directly into MCP tools.

```bash
npx mcpify-cli swagger ./tests/fixtures/swagger/petstore.yaml
```

### `audit [path]`

Static safety audit over the discovered tools and workflows — no files written.

```bash
npx mcpify-cli audit ./examples/express-api
```

### `simulate [path]`

When `ANTHROPIC_API_KEY` is set, runs an AI simulation battery against the compiled tool surface.

```bash
npx mcpify-cli simulate ./examples/express-api
```

## Architecture

Built for the way agents actually operate. A layered system that keeps your application untouched while exposing exactly what agents need:

1. **AI Agents:** Any agent runtime (Claude, GPT, Custom) connects over MCP to start operating your software like a power user.
2. **MCP Layer:** Generated tools, resources, and prompts that map 1:1 to real surface in your app. The contract agents speak.
3. **Permissions:** Every call passes through scopes, audit logs, and rate limits before it touches your system.
4. **Workflows:** Discovered user journeys exposed as composable, stateful operations agents can chain.
5. **Your App:** Your existing stack (Frontend, Backend, Database, APIs) — untouched. MCPify reads it; it never rewrites it.

## Repository Structure

```txt
mcpify/
  apps/
  docs/
  examples/
  landingPage/
  packages/
    ai-enhancer/
    backend-analyzer/
    cli/
    event-analyzer/
    frontend-analyzer/
    graph-engine/
    mcp-generator/
    monitoring/
    permissions/
    schema-engine/
    security/
    sync-engine/
    workflow-engine/
  tests/
```

## License

See [LICENSE](LICENSE).
