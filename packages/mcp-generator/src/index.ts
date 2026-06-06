// ─────────────────────────────────────────────────────────────────────────────
// @mcpify/mcp-generator
//
// Takes classified tools + workflows and writes a complete, runnable MCP server
// package to the output directory.  Files written:
//
//   package.json     npm manifest for the generated server
//   tsconfig.json    TypeScript config
//   schemas.ts       Zod input schemas for every tool
//   tools.ts         Tool definitions with metadata + JSON Schema
//   workflows.ts     Workflow definitions
//   handlers.ts      Generated handler bindings and explicit fallbacks
//   server.ts        MCP server entry point (fully wired, runs on stdio)
//   AGENTS.md        AI agent documentation file
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs/promises';
import path from 'path';
import { generateAllSchemas, tsTypeToJsonSchemaType } from '@mcpify/schema-engine';
import type { ClassifiedTool, Workflow, GenerationOutput, PermissionLevel } from '@mcpify/schema-engine';

// ─────────────────────────────────────────────────────────────────────────────
// MCPGenerator
// ─────────────────────────────────────────────────────────────────────────────

export class MCPGenerator {
  constructor(private outDir: string) {}

  async generate(
    tools:     ClassifiedTool[],
    workflows: Workflow[]
  ): Promise<GenerationOutput> {
    await fs.mkdir(this.outDir, { recursive: true });

    const files: string[] = [];
    const write = async (name: string, content: string) => {
      const p = path.join(this.outDir, name);
      await fs.writeFile(p, content, 'utf-8');
      files.push(p);
    };

    await write('package.json',  this._packageJson(tools));
    await write('tsconfig.json', this._tsConfig(tools));
    await write('schemas.ts',    generateAllSchemas(tools));
    await write('tools.ts',      this._renderTools(tools));
    await write('workflows.ts',  this._renderWorkflows(workflows));
    await write('handlers.ts',   this._renderHandlers(tools, workflows));
    await write('server.ts',     this._renderServer(tools, workflows));
    await write('AGENTS.md',     this._renderAgentsMd(tools, workflows));

    const safe    = tools.filter(t => t.permission === 'SAFE').length;
    const confirm = tools.filter(t => t.permission === 'REQUIRES_CONFIRMATION').length;
    const blocked = tools.filter(t => t.permission === 'BLOCKED').length;

    return {
      files,
      summary: {
        total:                tools.length,
        safe,
        requiresConfirmation: confirm,
        blocked,
        workflows:            workflows.length,
      },
    };
  }

  // ── package.json ───────────────────────────────────────────────────────────

  private _packageJson(tools: ClassifiedTool[]): string {
    const entry = this._distEntry('server.js', tools);
    return JSON.stringify({
      name:    '@mcpify/generated-server',
      version: '1.0.0',
      type:    'module',
      main:    entry,
      scripts: {
        build: 'tsc',
        start: `node ${entry.replace(/^\.\//, '')}`,
        dev:   'tsc --watch',
      },
      dependencies: {
        '@modelcontextprotocol/sdk': '^0.5.0',
        'zod':                       '^3.22.0',
      },
      devDependencies: {
        typescript:    '^5.4.0',
        '@types/node': '^20.0.0',
      },
    }, null, 2) + '\n';
  }

  // ── tsconfig.json ──────────────────────────────────────────────────────────

  private _tsConfig(tools: ClassifiedTool[]): string {
    const sourceRoot = this._sourceRoot(tools);
    const rootDir = relativePath(this.outDir, sourceRoot);
    const sourceIncludes = [...new Set(bindableBackendTools(tools).map(t => relativePath(this.outDir, t.filePath)))];

    return JSON.stringify({
      compilerOptions: {
        target:          'ES2022',
        module:          'ES2022',
        moduleResolution:'Node',
        strict:          true,
        outDir:          'dist',
        rootDir,
        declaration:     true,
        skipLibCheck:    true,
        esModuleInterop: true,
        allowJs:         true,
        checkJs:         false,
      },
      include: ['./**/*.ts', ...sourceIncludes],
      exclude: ['node_modules', 'dist'],
    }, null, 2) + '\n';
  }

  // ── tools.ts ───────────────────────────────────────────────────────────────

  private _sourceRoot(tools: ClassifiedTool[]): string {
    const sourceFiles = bindableBackendTools(tools).map(t => path.dirname(t.filePath));
    if (sourceFiles.length === 0) return this.outDir;
    return commonRoot([this.outDir, ...sourceFiles]);
  }

  private _distEntry(fileName: string, tools: ClassifiedTool[]): string {
    const sourceRoot = this._sourceRoot(tools);
    const outDirFromRoot = relativePath(sourceRoot, this.outDir);
    return path.posix
      .join('./dist', outDirFromRoot === '.' ? '' : outDirFromRoot, fileName)
      .replace(/\/+/g, '/');
  }

  private _renderTools(tools: ClassifiedTool[]): string {
    const header = `// Auto-generated by MCPify — do not edit manually.
// Re-run \`npx mcpify\` to regenerate after code changes.

`;

    const defs = tools.map(t => {
      const props = t.params
        .map((p, i) => `        ${p}: { type: '${tsTypeToJsonSchemaType(t.paramTypes[i] || 'string')}', description: '${p}' }`)
        .join(',\n');

      return `/**
 * ${t.description || t.name}
 *
 * @permission ${t.permission}
 * @source     ${t.source}${t.httpMethod ? `\n * @http       ${t.httpMethod} ${t.httpPath}` : ''}
 * @safety     ${t.safetyNotes ?? ''}
 */
export const ${t.name}Tool = {
  name:        '${t.name}',
  description: ${JSON.stringify(t.description || t.name)},
  permission:  '${t.permission}' as const,
  source:      '${t.source}' as const,
  inputSchema: {
    type: 'object' as const,
    properties: {
${props || '        // no parameters'}
    },
    required: ${JSON.stringify(t.params)},
  },
} satisfies McpifyTool;
`;
    }).join('\n');

    const toolType = `export interface McpifyTool {
  name:        string;
  description: string;
  permission:  'SAFE' | 'REQUIRES_CONFIRMATION' | 'BLOCKED' | 'UNKNOWN';
  source:      string;
  inputSchema: {
    type:       'object';
    properties: Record<string, { type: string; description?: string }>;
    required:   string[];
  };
}

`;

    const allTools = `
export const ALL_TOOLS: McpifyTool[] = [
${tools.map(t => `  ${t.name}Tool`).join(',\n')}
];

export const SAFE_TOOLS    = ALL_TOOLS.filter(t => t.permission === 'SAFE');
export const CONFIRM_TOOLS = ALL_TOOLS.filter(t => t.permission === 'REQUIRES_CONFIRMATION');
export const BLOCKED_TOOLS = ALL_TOOLS.filter(t => t.permission === 'BLOCKED');
`;

    return header + toolType + defs + allTools;
  }

  // ── workflows.ts ───────────────────────────────────────────────────────────

  private _renderWorkflows(workflows: Workflow[]): string {
    if (workflows.length === 0) {
      return `// Auto-generated by MCPify — no workflows detected.
export interface McpifyWorkflow {
  name:        string;
  description: string;
  steps:       string[];
  permission:  string;
}

export const ALL_WORKFLOWS: McpifyWorkflow[] = [];
`;
    }

    const header = `// Auto-generated by MCPify — do not edit manually.\n\n`;

    const iface = `export interface McpifyWorkflow {
  name:        string;
  description: string;
  steps:       string[];
  permission:  string;
}

`;

    const defs = workflows.map(w => `export const ${w.name}: McpifyWorkflow = {
  name:        '${w.name}',
  description: ${JSON.stringify(w.description)},
  steps:       ${JSON.stringify((w as any).steps ?? [], null, 2).replace(/\n/g, '\n  ')},
  permission:  '${w.permission}',
};
`).join('\n');

    const allWorkflows = `\nexport const ALL_WORKFLOWS: McpifyWorkflow[] = [\n${workflows.map(w => `  ${w.name}`).join(',\n')}\n];\n`;

    return header + iface + defs + allWorkflows;
  }

  // handlers.ts
  // Generates handler functions. Backend tools with matching source exports are
  // bound directly; tools without a source binding get an explicit fallback.

  private _renderHandlers(tools: ClassifiedTool[], workflows: Workflow[]): string {
    const header = `// ---------------------------------------------------------------------------
// handlers.ts - generated by MCPify
//
// Backend tools are bound to matching source exports when MCPify can resolve
// them. Unbound tools fail loudly so they are not mistaken for completed logic.
// ---------------------------------------------------------------------------

`;

    const bindings = new Map<string, string>();
    const boundImports = bindableBackendTools(tools).map((t, index) => {
      const alias = `__mcpify_${t.name}_${index}`;
      bindings.set(t.name, alias);
      return `import * as ${alias} from '${sourceImportPath(this.outDir, t.filePath)}';`;
    });

    const imports = [
      `import type { ToolInputs } from './schemas.js';`,
      ...boundImports,
    ].join('\n') + '\n\n';

    const exportResolver = boundImports.length > 0
      ? `function resolveExport(moduleExports: unknown, exportName: string): (...args: any[]) => unknown {
  const record = moduleExports as Record<string, any>;
  const value = record[exportName] ?? record.default?.[exportName];
  if (typeof value !== 'function') {
    throw new Error(\`source export is not callable: \${exportName}\`);
  }
  return value;
}

`
      : '';

    const handlers = tools
      .filter(t => t.permission !== 'BLOCKED')
      .map(t => {
        const paramStr = t.params.length > 0
          ? `args: ToolInputs['${t.name}']`
          : '';
        const paramComment = t.params.length > 0
          ? `\n  // Available: ${t.params.map((p, i) => `${p}: ${t.paramTypes[i] || 'unknown'}`).join(', ')}`
          : '';
        const boundImport = bindings.get(t.name);

        if (boundImport) {
          const callArgs = t.params.map(p => `args[${JSON.stringify(p)}] as any`).join(', ');
          return `/** ${t.description || t.name} */
export async function handle_${t.name}(${paramStr}): Promise<unknown> {${paramComment}
  return await resolveExport(${boundImport}, ${JSON.stringify(t.name)})(${callArgs});
}
`;
        }

        return `/** ${t.description || t.name} */
export async function handle_${t.name}(${paramStr}): Promise<unknown> {${paramComment}
  throw new Error('no source binding was generated for tool: ${t.name}');
}
`;
      })
      .join('\n');

    const toolRegistry = `type GeneratedHandler = (args: Record<string, unknown>) => Promise<unknown>;

const TOOL_HANDLERS: Record<string, GeneratedHandler> = {
${tools
  .filter(t => t.permission !== 'BLOCKED')
  .map(t => `  ${JSON.stringify(t.name)}: handle_${t.name} as GeneratedHandler`)
  .join(',\n')}
};

`;

    const workflowHandlers = workflows
      .filter(w => w.permission !== 'BLOCKED')
      .map(w => {
        const steps = ((w as any).steps as string[]) ?? [];
        return `/** ${w.description} */
export async function handle_${w.name}(args: Record<string, unknown>): Promise<unknown> {
  const results: Array<{ step: string; result: unknown }> = [];
  for (const step of ${JSON.stringify(steps)}) {
    const handler = TOOL_HANDLERS[step];
    if (!handler) {
      throw new Error(\`workflow step has no generated handler: \${step}\`);
    }
    results.push({ step, result: await handler(args) });
  }
  return { workflow: ${JSON.stringify(w.name)}, results };
}
`;
      })
      .join('\n');

    return header + imports + exportResolver + handlers + '\n' + toolRegistry + '\n// ── Workflow handlers ─────────────────────────\n\n' + workflowHandlers;
  }

  // ── server.ts ──────────────────────────────────────────────────────────────

  private _renderServer(tools: ClassifiedTool[], workflows: Workflow[]): string {
    const activeTools = tools.filter(t => t.permission !== 'BLOCKED');

    return `#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// MCPify Generated MCP Server
// Auto-generated — re-run \`npx mcpify\` to regenerate.
//
// Start:   npm run build && npm start
// Connect: add to claude_desktop_config.json (see AGENTS.md)
// ─────────────────────────────────────────────────────────────────────────────

import { Server }               from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { ALL_TOOLS }      from './tools.js';
import { ALL_WORKFLOWS }  from './workflows.js';

// Import your handlers — fill these in inside handlers.ts
import * as handlers from './handlers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Server setup
// ─────────────────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'mcpify-generated', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// ─────────────────────────────────────────────────────────────────────────────
// List tools  —  returns all non-blocked tools to the AI agent
// ─────────────────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const exposedTools: Tool[] = ALL_TOOLS
    .filter(t => t.permission !== 'BLOCKED')
    .map(t => ({
      name:        t.name,
      description: t.permission === 'REQUIRES_CONFIRMATION'
        ? \`[REQUIRES CONFIRMATION] \${t.description}\`
        : t.description,
      inputSchema: t.inputSchema,
    }));

  // Also expose workflows as callable tools
  const workflowTools: Tool[] = ALL_WORKFLOWS
    .filter(w => w.permission !== 'BLOCKED')
    .map(w => ({
      name:        w.name,
      description: \`[WORKFLOW] \${w.description}\`,
      inputSchema: { type: 'object' as const, properties: {}, required: [] },
    }));

  return { tools: [...exposedTools, ...workflowTools] };
});

// ─────────────────────────────────────────────────────────────────────────────
// Call tool  —  dispatches to handler, enforces permission gates
// ─────────────────────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  // ── Check if it's a workflow ─────────────────────────────────────────────
  const workflow = ALL_WORKFLOWS.find(w => w.name === name);
  if (workflow) {
    if (workflow.permission === 'BLOCKED') {
      return errorResponse(\`Workflow "\${name}" is blocked for AI agent execution.\`);
    }
    if (workflow.permission === 'REQUIRES_CONFIRMATION' && args['__confirmed'] !== true) {
      return confirmationRequired(name, workflow.description);
    }
    try {
      const handlerFn = (handlers as any)[\`handle_\${name}\`];
      if (typeof handlerFn !== 'function') {
        return errorResponse(\`Workflow "\${name}" has no handler implementation yet. See handlers.ts.\`);
      }
      const result = await handlerFn(args);
      return successResponse(name, result);
    } catch (err: any) {
      return errorResponse(\`Workflow "\${name}" failed: \${err.message}\`);
    }
  }

  // ── Check if it's a regular tool ─────────────────────────────────────────
  const tool = ALL_TOOLS.find(t => t.name === name);
  if (!tool) {
    return errorResponse(\`Unknown tool: "\${name}". Run npx mcpify to regenerate.\`);
  }

  if (tool.permission === 'BLOCKED') {
    return errorResponse(\`"\${name}" is blocked for AI agent execution. This is a human-only operation.\`);
  }

  if (tool.permission === 'REQUIRES_CONFIRMATION' && args['__confirmed'] !== true) {
    return confirmationRequired(name, tool.description);
  }

  // ── Dispatch to handler ───────────────────────────────────────────────────
  try {
    const handlerFn = (handlers as any)[\`handle_\${name}\`];
    if (typeof handlerFn !== 'function') {
      return errorResponse(\`"\${name}" has no handler implementation yet. Add it to handlers.ts.\`);
    }
    const result = await handlerFn(args);
    return successResponse(name, result);
  } catch (err: any) {
    return errorResponse(\`"\${name}" threw an error: \${err.message}\`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Response helpers
// ─────────────────────────────────────────────────────────────────────────────

function successResponse(name: string, result: unknown) {
  return {
    content: [{
      type: 'text' as const,
      text: typeof result === 'string'
        ? result
        : JSON.stringify(result, null, 2),
    }],
  };
}

function errorResponse(message: string) {
  return {
    content: [{ type: 'text' as const, text: \`❌ \${message}\` }],
    isError: true,
  };
}

function confirmationRequired(name: string, description: string) {
  return {
    content: [{
      type: 'text' as const,
      text: [
        \`⚠️  "\${name}" requires explicit user confirmation before execution.\`,
        \`\`,
        \`Description: \${description}\`,
        \`\`,
        \`To proceed, call this tool again with:\`,
        \`  { "__confirmed": true, ...your other arguments }\`,
        \`\`,
        \`Please ask the user if they want to proceed.\`,
      ].join('\\n'),
    }],
    isError: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[mcpify] MCP server running on stdio\\n');
  process.stderr.write(\`[mcpify] \${ALL_TOOLS.filter(t => t.permission !== 'BLOCKED').length} tools + \${ALL_WORKFLOWS.length} workflows exposed\\n\`);
}

main().catch(err => {
  process.stderr.write(\`[mcpify] Fatal: \${err.message}\\n\`);
  process.exit(1);
});
`;
  }

  // ── AGENTS.md ──────────────────────────────────────────────────────────────

  private _renderAgentsMd(tools: ClassifiedTool[], workflows: Workflow[]): string {
    const safe    = tools.filter(t => t.permission === 'SAFE');
    const confirm = tools.filter(t => t.permission === 'REQUIRES_CONFIRMATION');
    const blocked = tools.filter(t => t.permission === 'BLOCKED');
    const serverEntry = path.join(this.outDir, this._distEntry('server.js', tools).replace(/^\.\//, ''));

    const renderTool = (t: ClassifiedTool) => {
      const sig = t.params.length > 0
        ? `${t.name}(${t.params.map((p, i) => `${p}: ${t.paramTypes[i] || 'unknown'}`).join(', ')})`
        : `${t.name}()`;
      return `- **\`${sig}\`**  \n  ${t.description || '_No description_'}${t.httpMethod ? `  \n  \`${t.httpMethod} ${t.httpPath}\`` : ''}`;
    };

    const renderWorkflow = (w: Workflow) => {
      const steps = ((w as any).steps as string[]).map((s, i) => `${i + 1}. \`${s}()\``).join('\n');
      return `### \`${w.name}\`\n${w.description}\n\n**Steps:**\n${steps}\n\n**Permission:** ${w.permission}`;
    };

    return `# AGENTS.md
> Auto-generated by MCPify. This file documents the AI-operable interface for this application.
> Re-run \`npx mcpify\` to keep it in sync with the codebase.

## Overview

This MCP server exposes **${tools.length} tools** and **${workflows.length} workflows** to AI agents.

| Permission | Count | Meaning |
|---|---|---|
| ✅ SAFE | ${safe.length} | Agent may execute autonomously |
| ⚠️ REQUIRES_CONFIRMATION | ${confirm.length} | Agent must ask user before executing |
| 🚫 BLOCKED | ${blocked.length} | Human-only — never exposed to AI |
| 🔄 WORKFLOWS | ${workflows.length} | Multi-step composed operations |

---

## ✅ Safe Tools

These tools are read-only or non-destructive. AI agents may call them without user approval.

${safe.length > 0 ? safe.map(renderTool).join('\n\n') : '_None_'}

---

## ⚠️ Tools Requiring Confirmation

These tools perform mutating or consequential operations. The AI agent **must** ask the user
for explicit approval and then call the tool again with \`{ "__confirmed": true }\`.

${confirm.length > 0 ? confirm.map(renderTool).join('\n\n') : '_None_'}

---

## 🚫 Blocked Tools

These tools are **never** exposed to AI agents. They can only be run manually by a human.

${blocked.length > 0 ? blocked.map(t => `- \`${t.name}\` — ${t.description || '_No description_'}`).join('\n') : '_None_'}

---

## 🔄 Workflows

${workflows.length > 0 ? workflows.map(renderWorkflow).join('\n\n---\n\n') : '_No workflows detected._'}

---

## Connecting an AI Agent

### Claude Desktop

Add to \`~/Library/Application Support/Claude/claude_desktop_config.json\`:

\`\`\`json
{
  "mcpServers": {
    "my-app": {
      "command": "node",
      "args": ["${serverEntry}"]
    }
  }
}

\`\`\`

### Cursor

Add to \`.cursor/mcp.json\` in your project root:

\`\`\`json
{
  "mcpServers": {
    "my-app": {
      "command": "node",
      "args": ["${serverEntry}"]
    }
  }
}
\`\`\`

### Example Interaction

\`\`\`
User: Refund order #12345 and notify the customer.

Agent: This will execute refundOrder (REQUIRES_CONFIRMATION).
       Shall I proceed?

User:  Yes.

Agent: ✓ refundOrder(orderId="12345") — success
       ✓ sendMessage(customerId="cust_99") — notification sent
\`\`\`

---

*Generated by MCPify · ${new Date().toISOString()}*
`;
  }
}

function bindableBackendTools(tools: ClassifiedTool[]): ClassifiedTool[] {
  return tools.filter(tool =>
    tool.source === 'backend' &&
    tool.permission !== 'BLOCKED' &&
    Boolean(tool.filePath) &&
    isValidIdentifier(tool.name) &&
    !tool.name.includes('_')
  );
}

function isValidIdentifier(value: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

function sourceImportPath(outDir: string, filePath: string): string {
  return toJsImportPath(relativePath(outDir, filePath));
}

function relativePath(from: string, to: string): string {
  const rel = path.relative(from, to).replace(/\\/g, '/');
  return rel === '' ? '.' : rel.startsWith('.') ? rel : `./${rel}`;
}

function toJsImportPath(importPath: string): string {
  const withoutExtension = importPath.replace(/\.(tsx?|jsx?)$/, '.js');
  return withoutExtension.startsWith('.') ? withoutExtension : `./${withoutExtension}`;
}

function commonRoot(paths: string[]): string {
  const [first, ...rest] = paths.map(p => path.resolve(p));
  const root = first.split(/[\\/]+/);

  for (const current of rest) {
    const parts = current.split(/[\\/]+/);
    let index = 0;
    while (index < root.length && index < parts.length && root[index].toLowerCase() === parts[index].toLowerCase()) {
      index += 1;
    }
    root.length = index;
  }

  if (root.length === 0) return path.parse(first).root;
  return root.join(path.sep) || path.parse(first).root;
}
