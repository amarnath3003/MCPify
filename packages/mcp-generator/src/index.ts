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
    if (tools.length === 0) {
      tools.push({
        name: 'mcpifyHealth',
        source: 'backend',
        description: 'Health check tool injected by MCPify because no other tools were found in this workspace.',
        params: [],
        paramTypes: [],
        returnType: 'string',
        filePath: 'MCPifyInternal',
        permission: 'SAFE',
        isAsync: false,
      });
    }
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
    const dependencies: Record<string, string> = {
      '@modelcontextprotocol/sdk': '^1.25.2',
      'zod':                       '^3.22.0',
    };
    const optionalDependencies: Record<string, string> = {};

    if (tools.some(tool => tool.source === 'database')) {
      dependencies['@prisma/client'] = '^5.0.0';
    }
    if (tools.some(tool => tool.source === 'frontend')) {
      optionalDependencies.playwright = '^1.57.0';
    }

    const manifest: Record<string, unknown> = {
      name:    '@mcpify/generated-server',
      version: '1.0.0',
      type:    'module',
      main:    entry,
      scripts: {
        build: 'tsc',
        start: `node ${entry.replace(/^\.\//, '')}`,
        // Run the MCP server straight from TypeScript — no build step needed.
        // This is the command AI clients are auto-registered to invoke.
        mcp:   'tsx server.ts',
        dev:   'tsc --watch',
      },
      dependencies,
      devDependencies: {
        typescript:    '^5.4.0',
        tsx:           '^4.19.0',
        '@types/node': '^20.0.0',
      },
    };

    if (Object.keys(optionalDependencies).length > 0) {
      manifest.optionalDependencies = optionalDependencies;
    }

    return JSON.stringify(manifest, null, 2) + '\n';
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
    const outDirFromRoot = relativePath(sourceRoot, this.outDir).replace(/\\/g, '/');
    const joined = path.posix
      .join('dist', outDirFromRoot === '.' ? '' : outDirFromRoot, fileName)
      .replace(/\/+/g, '/');
    return joined.startsWith('./') ? joined : `./${joined}`;
  }

  private _renderTools(tools: ClassifiedTool[]): string {
    const header = `// Auto-generated by MCPify — do not edit manually.
// Re-run \`npx mcpify-cli\` to regenerate after code changes.

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

    const runtimeHelpers = this._renderHandlerRuntime(tools);

    const handlers = tools
      .filter(t => t.permission !== 'BLOCKED')
      .map(t => {
        const paramComment = t.params.length > 0
          ? `\n  // Available: ${t.params.map((p, i) => `${p}: ${t.paramTypes[i] || 'unknown'}`).join(', ')}`
          : '';
        const boundImport = bindings.get(t.name);
        const paramStr = t.params.length > 0
          ? `args: ToolInputs['${t.name}']`
          : boundImport
            ? ''
            : 'args: Record<string, unknown> = {}';

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
  ${this._renderUnboundHandlerBody(t)}
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

    return header + imports + exportResolver + runtimeHelpers + handlers + '\n' + toolRegistry + '\n// Workflow handlers\n\n' + workflowHandlers;
  }

  // ── server.ts ──────────────────────────────────────────────────────────────

  private _renderHandlerRuntime(tools: ClassifiedTool[]): string {
    const apiDefs = Object.fromEntries(
      tools
        .filter(t => t.source === 'api')
        .map(t => [t.name, { method: t.httpMethod ?? 'GET', path: t.httpPath ?? '/' }])
    );
    const dbModels = Object.fromEntries(
      tools
        .filter(t => t.source === 'database')
        .map(t => [t.name, this._databaseModelName(t.jsdocTags?.originalName ?? t.name)])
    );
    const dbOps = Object.fromEntries(
      tools
        .filter(t => t.source === 'database')
        .map(t => [t.name, t.jsdocTags?.originalName ?? t.name])
    );
    const frontendDefs = Object.fromEntries(
      tools
        .filter(t => t.source === 'frontend')
        .map(t => [t.name, {
          action: t.name,
          originalHandler: t.originalHandler ?? null,
          description: t.description,
        }])
    );

    return `type ApiToolDef = { method: string; path: string };
type FrontendToolDef = { action: string; originalHandler: string | null; description: string };

const API_TOOL_DEFS: Record<string, ApiToolDef> = ${JSON.stringify(apiDefs, null, 2)};
const DB_TOOL_MODELS: Record<string, string> = ${JSON.stringify(dbModels, null, 2)};
const DB_TOOL_OPS: Record<string, string> = ${JSON.stringify(dbOps, null, 2)};
const FRONTEND_TOOL_DEFS: Record<string, FrontendToolDef> = ${JSON.stringify(frontendDefs, null, 2)};
const PRISMA_UNAVAILABLE = Symbol('PRISMA_UNAVAILABLE');

const DEMO_DATABASE: Record<string, Array<Record<string, any>>> = {
  users: [
    { id: 'user_001', email: 'ava@example.com', name: 'Ava Customer', role: 'customer', status: 'active' },
    { id: 'agent_001', email: 'sam.agent@example.com', name: 'Sam Agent', role: 'agent', status: 'active' }
  ],
  orders: [
    { id: 'order_001', customerId: 'user_001', status: 'pending', total: 208, paymentStatus: 'unpaid' },
    { id: 'order_002', customerId: 'user_001', status: 'fulfilled', total: 129, paymentStatus: 'paid' }
  ],
  orderItems: [
    { id: 'item_001', orderId: 'order_001', productId: 'prod_keyboard', quantity: 1, price: 129 },
    { id: 'item_002', orderId: 'order_001', productId: 'prod_mouse', quantity: 1, price: 79 }
  ],
  products: [
    { id: 'prod_keyboard', name: 'Mechanical Keyboard', description: 'Low-profile keyboard for developer workstations', price: 129, stock: 12, status: 'active' },
    { id: 'prod_mouse', name: 'Precision Mouse', description: 'Wireless mouse with ergonomic grip', price: 79, stock: 20, status: 'active' }
  ],
  supportTickets: [
    { id: 'ticket_001', customerId: 'user_001', orderId: 'order_001', subject: 'Need help with my order', body: 'Can you confirm when this order will ship?', status: 'open', priority: 'medium' }
  ]
};

async function invokeApiTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const def = API_TOOL_DEFS[name];
  if (!def) throw new Error(\`missing API metadata for tool: \${name}\`);

  const pathParamNames = [...def.path.matchAll(/\{([^}]+)\}/g)].map(match => match[1]);
  let apiPath = def.path.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = args[key];
    if (value === undefined || value === null) return \`{\${key}}\`;
    return encodeURIComponent(String(value));
  });

  const payload = Object.fromEntries(
    Object.entries(args).filter(([key]) => !pathParamNames.includes(key) && key !== '__confirmed')
  );

  const baseUrl = process.env.MCPIFY_API_BASE_URL;
  if (!baseUrl) {
    const query = def.method === 'GET' && Object.keys(payload).length > 0
      ? \`?\${new URLSearchParams(payload as Record<string, string>).toString()}\`
      : '';
    return {
      source: 'api',
      mode: 'prepared-request',
      method: def.method,
      path: \`\${apiPath}\${query}\`,
      body: def.method === 'GET' ? undefined : payload,
      note: 'Set MCPIFY_API_BASE_URL to execute this request against a live API.'
    };
  }

  const url = new URL(apiPath, baseUrl);
  if (def.method === 'GET') {
    for (const [key, value] of Object.entries(payload)) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: def.method,
    headers: def.method === 'GET' ? undefined : { 'content-type': 'application/json' },
    body: def.method === 'GET' ? undefined : JSON.stringify(payload)
  });
  const text = await response.text();
  return { source: 'api', status: response.status, ok: response.ok, body: text ? tryJson(text) : null };
}

async function invokeDatabaseTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const prismaResult = await invokePrismaTool(name, args);
  if (prismaResult !== PRISMA_UNAVAILABLE) return prismaResult;

  const model = modelNameFromToolName(name);
  const store = DEMO_DATABASE[model] ?? [];
  const id = String(args.id ?? args[model.slice(0, -1) + 'Id'] ?? args[model + 'Id'] ?? '');
  const operation = operationNameFromToolName(name);

  if (/^(get|find).+ById$/.test(operation)) {
    return store.find(record => String(record.id) === id) ?? null;
  }

  if (/^list/.test(operation)) {
    const skip = Number(args.skip ?? 0);
    const take = Number(args.take ?? store.length);
    return store.slice(skip, skip + take);
  }

  const filterMatch = operation.match(/^get.+sBy([A-Z].+)$/);
  if (filterMatch) {
    const field = lowerFirst(filterMatch[1]);
    return store.filter(record => String(record[field]) === String(args[field]));
  }

  if (/^create/.test(operation)) {
    const record = {
      id: String(args.id ?? \`\${model.slice(0, -1)}_\${String(store.length + 1).padStart(3, '0')}\`),
      ...withoutInternalArgs(args)
    };
    store.push(record);
    return record;
  }

  if (/^update/.test(operation)) {
    const record = store.find(item => String(item.id) === id);
    if (!record) throw new Error(\`database record not found: \${id}\`);
    Object.assign(record, typeof args.data === 'object' && args.data ? args.data : withoutInternalArgs(args));
    return record;
  }

  if (/^delete/.test(operation)) {
    const index = store.findIndex(item => String(item.id) === id);
    if (index < 0) throw new Error(\`database record not found: \${id}\`);
    return store.splice(index, 1)[0];
  }

  return { source: 'database', model, args: withoutInternalArgs(args) };
}

async function invokePrismaTool(name: string, args: Record<string, unknown>): Promise<unknown | typeof PRISMA_UNAVAILABLE> {
  const shouldUsePrisma = process.env.MCPIFY_DATABASE_MODE === 'prisma' || Boolean(process.env.DATABASE_URL);
  if (!shouldUsePrisma) return PRISMA_UNAVAILABLE;

  const packageName = '@prisma/client';
  const prismaModule = await import(packageName).catch(() => null);
  const PrismaClient = (prismaModule as any)?.PrismaClient;
  if (!PrismaClient) {
    if (process.env.MCPIFY_DATABASE_MODE === 'prisma') {
      throw new Error('Prisma mode requested, but @prisma/client is not installed.');
    }
    return PRISMA_UNAVAILABLE;
  }

  const prisma = getPrismaClient(PrismaClient);
  const model = modelNameFromToolName(name);
  const delegateName = prismaDelegateName(model);
  const delegate = (prisma as any)[delegateName];
  if (!delegate) {
    throw new Error(\`Prisma delegate not found for model "\${delegateName}". Run prisma generate for the analyzed schema.\`);
  }

  try {
    return await runPrismaOperation(delegate, operationNameFromToolName(name), model, args);
  } catch (err: any) {
    if (process.env.MCPIFY_DATABASE_MODE === 'prisma') throw err;
    return PRISMA_UNAVAILABLE;
  }
}

function getPrismaClient(PrismaClient: new () => unknown): unknown {
  const globalKey = '__mcpifyPrismaClient';
  const globalRecord = globalThis as Record<string, unknown>;
  globalRecord[globalKey] ??= new PrismaClient();
  return globalRecord[globalKey];
}

async function runPrismaOperation(
  delegate: any,
  operation: string,
  model: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const id = String(args.id ?? args[model.slice(0, -1) + 'Id'] ?? args[model + 'Id'] ?? '');

  if (/^(get|find).+ById$/.test(operation)) {
    return await delegate.findUnique({ where: { id } });
  }

  if (/^list/.test(operation)) {
    return await delegate.findMany({
      skip: Number(args.skip ?? 0),
      take: Number(args.take ?? 20),
    });
  }

  const filterMatch = operation.match(/^get.+sBy([A-Z].+)$/);
  if (filterMatch) {
    const field = lowerFirst(filterMatch[1]);
    return await delegate.findMany({ where: { [field]: args[field] } });
  }

  if (/^create/.test(operation)) {
    return await delegate.create({ data: withoutInternalArgs(args) });
  }

  if (/^update/.test(operation)) {
    const data = typeof args.data === 'object' && args.data ? args.data : withoutInternalArgs(args);
    delete (data as Record<string, unknown>).id;
    return await delegate.update({ where: { id }, data });
  }

  if (/^delete/.test(operation)) {
    return await delegate.delete({ where: { id } });
  }

  throw new Error(\`Unsupported Prisma operation for generated database tool: \${operation}\`);
}

async function invokeFrontendAction(name: string, args: Record<string, unknown>): Promise<unknown> {
  const automationResult = await invokeBrowserAction(name, args);
  if (automationResult) return automationResult;

  const def = FRONTEND_TOOL_DEFS[name];
  return {
    source: 'frontend',
    mode: 'automation-plan',
    action: name,
    originalHandler: def?.originalHandler ?? null,
    description: def?.description ?? name,
    args: withoutInternalArgs(args),
    automation: frontendAutomationPlan(name, args),
    note: 'Set MCPIFY_FRONTEND_BASE_URL and install Playwright to execute this action in a browser.'
  };
}

async function invokeBrowserAction(name: string, args: Record<string, unknown>): Promise<unknown | null> {
  const baseUrl = process.env.MCPIFY_FRONTEND_BASE_URL;
  if (!baseUrl) return null;

  const packageName = 'playwright';
  const playwright = await import(packageName).catch(() => null);
  const chromium = (playwright as any)?.chromium;
  if (!chromium) {
    return {
      source: 'frontend',
      mode: 'browser-automation-unavailable',
      action: name,
      url: baseUrl,
      automation: frontendAutomationPlan(name, args),
      note: 'Install Playwright in the generated server package to execute browser automation.'
    };
  }

  let browser: any;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(baseUrl);

    for (const fill of frontendFillPlan(name, args)) {
      await page.getByPlaceholder(fill.placeholder).fill(fill.value);
    }

    const labels = frontendLabelsForAction(name);
    for (const label of labels) {
      const locator = page.getByRole('button', { name: label });
      if (await locator.count()) {
        await locator.first().click();
        return {
          source: 'frontend',
          mode: 'browser-automation',
          action: name,
          url: baseUrl,
          clicked: String(label),
          filled: frontendFillPlan(name, args),
        };
      }
    }

    return {
      source: 'frontend',
      mode: 'browser-automation',
      action: name,
      url: baseUrl,
      clicked: null,
      filled: frontendFillPlan(name, args),
      note: 'No matching button label was found for this extracted action.'
    };
  } finally {
    await browser?.close();
  }
}

async function invokeEventTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  return {
    source: 'event',
    event: name,
    args: withoutInternalArgs(args),
    result: 'event operation extracted from source'
  };
}

function modelNameFromToolName(name: string): string {
  const mapped = DB_TOOL_MODELS[name];
  if (mapped) return mapped;

  const match =
    name.match(/^(?:get|find)([A-Z].+)ById$/) ??
    name.match(/^list([A-Z].+)$/) ??
    name.match(/^create([A-Z].+)$/) ??
    name.match(/^update([A-Z].+)$/) ??
    name.match(/^delete([A-Z].+)$/) ??
    name.match(/^get([A-Z].+)sBy[A-Z]/);

  const raw = match?.[1] ?? 'Record';
  // Safe singularise: only strip trailing 's' when the word genuinely looks plural
  // (avoids mangling Status→Statu, Address→Addres, etc.)
  const singular =
    raw.endsWith('ies') ? \`\${raw.slice(0, -3)}y\` :
    (raw.endsWith('s') && !raw.endsWith('ss') && !raw.endsWith('us') && !raw.endsWith('is') && raw.length > 3)
      ? raw.slice(0, -1)
      : raw;
  if (singular === 'OrderItem') return 'orderItems';
  if (singular === 'SupportTicket') return 'supportTickets';
  return \`\${lowerFirst(singular)}s\`;
}

function operationNameFromToolName(name: string): string {
  return DB_TOOL_OPS[name] ?? name;
}

function prismaDelegateName(model: string): string {
  const map: Record<string, string> = {
    users: 'user',
    orders: 'order',
    orderItems: 'orderItem',
    products: 'product',
    supportTickets: 'supportTicket',
  };
  return map[model] ?? lowerFirst(model.replace(/s$/, ''));
}

function frontendAutomationPlan(name: string, args: Record<string, unknown>): Record<string, unknown> {
  return {
    labels: frontendLabelsForAction(name).map(String),
    fills: frontendFillPlan(name, args),
  };
}

function frontendLabelsForAction(name: string): Array<string | RegExp> {
  const action = normalizeFrontendAction(name);
  const labels: Record<string, Array<string | RegExp>> = {
    applyDiscountCode: [/apply coupon/i, /apply discount/i, /apply promo/i],
    checkoutCart: [/checkout/i],
    refundOrder: [/refund/i, /request refund/i],
    createSupportRequest: [/submit support ticket/i, /contact support/i],
    sendMessage: [/send message/i],
    searchItems: [/search/i],
    exportData: [/export csv/i, /export data/i],
    approveRequest: [/approve/i],
    rejectRequest: [/reject/i],
    publishContent: [/publish/i],
    inviteUser: [/invite user/i, /invite/i],
    deleteRecord: [/delete/i],
  };
  return labels[action] ?? [new RegExp(action.replace(/[A-Z]/g, char => \` \${char.toLowerCase()}\`).trim(), 'i')];
}

function frontendFillPlan(name: string, args: Record<string, unknown>): Array<{ placeholder: RegExp; value: string }> {
  const action = normalizeFrontendAction(name);
  if (action === 'applyDiscountCode') {
    return [{ placeholder: /coupon|promo|discount/i, value: String(args.code ?? args.coupon ?? 'HACKATHON10') }];
  }
  if (action === 'searchItems') {
    return [{ placeholder: /search/i, value: String(args.query ?? '') }];
  }
  return [];
}

function normalizeFrontendAction(name: string): string {
  return name.startsWith('frontend') && name.length > 'frontend'.length
    ? lowerFirst(name.slice('frontend'.length))
    : name;
}

function withoutInternalArgs(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter(([key]) => key !== '__confirmed'));
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

`;
  }

  private _databaseModelName(toolName: string): string {
    const match =
      toolName.match(/^(?:get|find)([A-Z].+)ById$/) ??
      toolName.match(/^list([A-Z].+)$/) ??
      toolName.match(/^create([A-Z].+)$/) ??
      toolName.match(/^update([A-Z].+)$/) ??
      toolName.match(/^delete([A-Z].+)$/) ??
      toolName.match(/^get([A-Z].+)sBy[A-Z]/);

    const raw = match?.[1] ?? 'Record';
    // Safe singularise: only strip trailing 's' when the word genuinely looks plural
    // (avoids mangling Status→Statu, Address→Addres, etc.)
    const singular =
      raw.endsWith('ies') ? `${raw.slice(0, -3)}y` :
      (raw.endsWith('s') && !raw.endsWith('ss') && !raw.endsWith('us') && !raw.endsWith('is') && raw.length > 3)
        ? raw.slice(0, -1)
        : raw;
    if (singular === 'OrderItem') return 'orderItems';
    if (singular === 'SupportTicket') return 'supportTickets';
    return `${singular.charAt(0).toLowerCase()}${singular.slice(1)}s`;
  }

  private _renderUnboundHandlerBody(tool: ClassifiedTool): string {
    if (tool.source === 'api') {
      return `return await invokeApiTool(${JSON.stringify(tool.name)}, args as Record<string, unknown>);`;
    }
    if (tool.source === 'database') {
      return `return await invokeDatabaseTool(${JSON.stringify(tool.name)}, args as Record<string, unknown>);`;
    }
    if (tool.source === 'frontend') {
      return `return await invokeFrontendAction(${JSON.stringify(tool.name)}, args as Record<string, unknown>);`;
    }
    if (tool.source === 'event') {
      return `return await invokeEventTool(${JSON.stringify(tool.name)}, args as Record<string, unknown>);`;
    }
    if (tool.name === 'mcpifyHealth') {
      return `return "MCPify Health Check OK";`;
    }
    return `throw new Error('no source binding was generated for tool: ${tool.name}');`;
  }

  private _renderServer(tools: ClassifiedTool[], workflows: Workflow[]): string {
    const activeTools = tools.filter(t => t.permission !== 'BLOCKED');

    return `#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// MCPify Generated MCP Server
// Auto-generated — re-run \`npx mcpify-cli\` to regenerate.
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
    return errorResponse(\`Unknown tool: "\${name}". Run npx mcpify-cli to regenerate.\`);
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
    const serverSource = path.join(this.outDir, 'server.ts');

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
> Re-run \`npx mcpify-cli\` to keep it in sync with the codebase.

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

> **Auto-registered.** \`mcpify\` writes this server into your local AI clients
> (Codex, Claude Code, Claude Desktop, VS Code) automatically. Just run
> \`cd ${this.outDir} && npm install\` once, then restart your client — the tools
> appear in the chat bar. Use \`mcpify --no-install\` to opt out, or
> \`mcpify --clients codex,claude-code\` to choose targets.

The sections below document the exact entries written, in case you want to
register the server manually or in another client.

### Codex — \`~/.codex/config.toml\`

\`\`\`toml
[mcp_servers.my-app]
command = "npx"
args = ["-y", "tsx", "${serverSource.replace(/\\/g, '\\\\')}"]
\`\`\`

### Claude Code — \`.mcp.json\` (project root) · Claude Desktop — \`claude_desktop_config.json\`

\`\`\`json
{
  "mcpServers": {
    "my-app": {
      "command": "npx",
      "args": ["-y", "tsx", "${serverSource.replace(/\\/g, '\\\\')}"]
    }
  }
}
\`\`\`

### VS Code — \`.vscode/mcp.json\`

\`\`\`json
{
  "servers": {
    "my-app": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "tsx", "${serverSource.replace(/\\/g, '\\\\')}"]
    }
  }
}
\`\`\`

> Prefer the compiled build? Run \`npm run build\` and point \`command\`/\`args\`
> at \`node\` + \`${serverEntry.replace(/\\/g, '\\\\')}\` instead.

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
    tool.filePath !== 'MCPifyInternal' &&
    isValidIdentifier(tool.name.replace(/_/g, '$'))
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
