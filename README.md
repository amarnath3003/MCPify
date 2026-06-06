<p align="center">
  <img src="assets/logo.png" alt="MCPify" width="720" />
</p>

<p align="center">
  <strong>Compile software into AI-operable systems.</strong>
</p>

<p align="center">
  MCPify analyzes real application code and generates agent-ready MCP surfaces with workflows, permissions, and security metadata.
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#cli">CLI</a> ·
  <a href="#generated-output">Generated Output</a>
</p>

---

<p align="center">
  <img src="https://github.com/amarnath3003/MCPify/raw/main/assets/recording.mp4" 
       width="1080" 
       alt="Demo recording" />
</p>


---

## Overview

MCPify is an AI enablement compiler for existing software systems. It scans the parts of an application that matter to agents:

- backend routes, controllers, and services
- frontend actions and form submissions
- OpenAPI and Swagger specifications
- Prisma, Drizzle, and Mongoose data models
- event-driven entry points such as webhooks, Kafka, RabbitMQ, and EventEmitter listeners
- multi-step workflows inferred from the discovered tool graph

From that analysis, MCPify generates a runnable MCP server plus the metadata an agent needs to use it safely.

## What MCPify Produces

Running the compiler creates an output directory, `./.mcpify` by default, containing:

- `server.ts` - MCP server entry point
- `handlers.ts` - generated handler registry with source-bound backend handlers and demo-safe fallbacks for API, database, frontend, and event tools
- `tools.ts` - tool metadata and JSON schema definitions
- `workflows.ts` - inferred workflow definitions
- `schemas.ts` - Zod-based input schemas
- `AGENTS.md` - agent-facing usage and permission guide
- `package.json` and `tsconfig.json` - standalone build files for the generated server

## Getting Started

This repository is a private monorepo, so the easiest way to try MCPify is from source:

```bash
npm install
npm run build
```

Run the CLI against the flagship ecommerce example:

```bash
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

The current CLI surface in this repo includes:

### `analyze [path]`

Default command. Runs the full pipeline:

- backend analysis
- optional OpenAPI, Prisma, Drizzle, and Mongoose analysis
- event and webhook discovery
- optional frontend extraction
- workflow detection
- permission classification
- MCP server generation

Example:

```bash
npm run mcpify -- analyze . \
  --swagger ./tests/fixtures/swagger/petstore.yaml \
  --prisma ./tests/fixtures/prisma/simple.prisma \
  --watch
```

Useful flags:

- `--output <dir>` to change the generated output directory
- `--no-frontend` to skip UI action extraction
- `--no-events` to skip webhook and listener analysis
- `--no-workflows` to skip workflow detection
- `--ai-enhance` to improve tool descriptions when `ANTHROPIC_API_KEY` is set

### `interactive`

Prompts for which analyzers to run and which source files to include.

```bash
npm run mcpify -- interactive
```

### `frontend [path]`

Extracts UI actions only and can print raw JSON.

```bash
npm run mcpify -- frontend ./examples/internal-tool --json
```

### `swagger <file>`

Converts an OpenAPI or Swagger spec directly into MCP tools.

```bash
npm run mcpify -- swagger ./tests/fixtures/swagger/petstore.yaml
```

### `audit [path]`

Runs a static safety audit over the discovered tools and workflows without generating files.

```bash
npm run mcpify -- audit ./examples/express-api
```

### `simulate [path]`

Runs the static audit and, when `ANTHROPIC_API_KEY` is available, executes an AI simulation battery against the discovered tool surface.

```bash
npm run mcpify -- simulate ./examples/express-api
```

## Supported Analysis Surface

### Backend

The backend analyzer scans TypeScript and JavaScript code to extract callable actions from services, controllers, and route handlers.

The repo currently includes analyzers and tests around:

- general backend extraction
- OpenAPI and Swagger conversion
- Prisma schema analysis
- Drizzle table analysis
- Mongoose schema and model analysis

### Frontend

Frontend extraction is focused on user-triggered intent:

- React and JSX handlers
- Vue templates
- Svelte components
- Angular inline templates
- form submissions and navigational actions

### Events

The event analyzer looks for agent-relevant asynchronous entry points such as:

- webhooks
- EventEmitter listeners
- Kafka consumers
- RabbitMQ consumers

### Workflows

The workflow engine uses the discovered tool set to infer multi-step actions such as checkout, approval, request handling, and other composed flows.

### Permissions and Safety

Every generated tool is classified into one of three permission states:

- `SAFE`
- `REQUIRES_CONFIRMATION`
- `BLOCKED`

Those classifications flow into the generated MCP server and the generated `AGENTS.md` guide so agent runtimes know what can be called directly and what requires a human checkpoint.

## Generated Output

The compiler output is meant to be inspected and extended, not treated as opaque codegen.

`handlers.ts` is especially important: it contains the generated handler registry, source-bound backend handlers, prepared API calls, in-memory database demo handlers, frontend action responses, and workflow orchestration.

The generated server:

- exposes non-blocked tools through MCP
- exposes detected workflows as callable tools
- validates inputs with generated schemas
- preserves permission metadata for agent-facing safety
- executes Prisma-backed database tools when a Prisma client and `DATABASE_URL` are configured, with a demo fallback for offline showcases
- can run frontend actions through Playwright when `MCPIFY_FRONTEND_BASE_URL` is set, otherwise returning an automation plan

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

## Examples

The repository includes example projects you can compile today:

- `examples/ecommerce-saas` - flagship full-surface MVP demo
- `examples/express-api`
- `examples/internal-tool`
- `examples/nestjs-app`
- `examples/swagger-only`

## Current Status

This repo already contains working analyzers, tests, and generator output for the core compiler path. Some of the broader product language in the landing page points toward the roadmap, but the source of truth for implemented CLI behavior is the code under `packages/cli` and the generator stack under `packages/*`.

## License

See [LICENSE](LICENSE).
