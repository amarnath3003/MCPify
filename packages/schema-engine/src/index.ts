// ─────────────────────────────────────────────────────────────────────────────
// @mcpify/schema-engine  —  shared types & Zod schema generation
// ─────────────────────────────────────────────────────────────────────────────

// ── Permission levels ─────────────────────────────────────────────────────────

export type PermissionLevel =
  | 'SAFE'                   // read-only / non-destructive — agent can run autonomously
  | 'REQUIRES_CONFIRMATION'  // mutating but reversible — agent must ask user first
  | 'BLOCKED'                // irreversible / dangerous  — humans only, never exposed
  | 'UNKNOWN';               // not yet classified

// ── Source of an extracted tool ───────────────────────────────────────────────

export type ToolSource =
  | 'backend'    // TypeScript/JS exported function
  | 'frontend'   // JSX button / form / event handler
  | 'api'        // OpenAPI / Swagger endpoint
  | 'database'   // Prisma / Drizzle / Mongoose model
  | 'event'      // Kafka / RabbitMQ / EventEmitter
  | 'workflow';  // Composed multi-step sequence

// ── Core extracted tool ───────────────────────────────────────────────────────

export interface ExtractedTool {
  /** Camel-case action name e.g. "refundOrder" */
  name: string;
  /** Where in the app this was found */
  source: ToolSource;
  /** Human-readable description (may be empty before AI enhancement) */
  description: string;
  /** Parameter names in order */
  params: string[];
  /** TypeScript types for each param */
  paramTypes: string[];
  /** Return type as a TypeScript string */
  returnType: string;
  /** Absolute path of the source file */
  filePath: string;
  /** Classified permission level */
  permission: PermissionLevel;
  /** Whether the function is async */
  isAsync: boolean;
  /** Original JSX handler name before semantic resolution */
  originalHandler?: string;
  /** HTTP method if from an API route */
  httpMethod?: string;
  /** HTTP path pattern if from an API route */
  httpPath?: string;
  /** JSDoc tags for richer metadata */
  jsdocTags?: Record<string, string>;
}

// ── Workflow ──────────────────────────────────────────────────────────────────

export interface Workflow extends ExtractedTool {
  /** Ordered list of tool names that make up this workflow */
  steps: string[];
}

// ── After permission classification ──────────────────────────────────────────

export interface ClassifiedTool extends ExtractedTool {
  permission: PermissionLevel;
  safetyNotes?: string;
}

// ── Generation output ─────────────────────────────────────────────────────────

export interface GenerationOutput {
  /** Absolute paths of all written files */
  files: string[];
  /** Summary counts */
  summary: {
    total: number;
    safe: number;
    requiresConfirmation: number;
    blocked: number;
    workflows: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Zod schema generator
// ─────────────────────────────────────────────────────────────────────────────

/** Map TypeScript primitive types → Zod builder calls */
const TS_TO_ZOD: Record<string, string> = {
  string:       'z.string()',
  number:       'z.number()',
  boolean:      'z.boolean()',
  Date:         'z.coerce.date()',
  unknown:      'z.unknown()',
  any:          'z.any()',
  void:         'z.void()',
  null:         'z.null()',
  undefined:    'z.undefined()',
  'string[]':   'z.array(z.string())',
  'number[]':   'z.array(z.number())',
  'boolean[]':  'z.array(z.boolean())',
  Record:       'z.record(z.string(), z.unknown())',
  object:       'z.object({}).passthrough()',
};

function tsTypeToZod(tsType: string): string {
  const trimmed = tsType.trim();
  if (TS_TO_ZOD[trimmed]) return TS_TO_ZOD[trimmed];
  // Union types  e.g. 'pending' | 'active' | 'cancelled'
  if (trimmed.includes('|')) {
    const members = trimmed.split('|').map(m => m.trim().replace(/^['"]|['"]$/g, ''));
    if (members.every(m => /^[a-z_][a-z0-9_]*$/i.test(m) || /^'[^']+'$/.test(m))) {
      return `z.enum([${members.map(m => `'${m}'`).join(', ')}])`;
    }
  }
  // Array generics e.g. Array<string>
  const arrayMatch = trimmed.match(/^Array<(.+)>$/);
  if (arrayMatch) return `z.array(${tsTypeToZod(arrayMatch[1])})`;
  // Optional e.g. string | undefined
  if (trimmed.endsWith('| undefined')) {
    return `${tsTypeToZod(trimmed.replace('| undefined', '').trim())}.optional()`;
  }
  return 'z.unknown()';
}

/** Generate a Zod object schema for a single tool */
export function generateZodSchema(tool: ExtractedTool): string {
  if (tool.params.length === 0) {
    return `export const ${tool.name}Schema = z.object({});`;
  }
  const fields = tool.params.map((param, i) => {
    const zodType = tsTypeToZod(tool.paramTypes[i] || 'unknown');
    return `  /** ${param} */\n  ${param}: ${zodType}`;
  });
  return `export const ${tool.name}Schema = z.object({\n${fields.join(',\n')}\n});`;
}

/** Generate the entire schemas.ts file */
export function generateAllSchemas(tools: ExtractedTool[]): string {
  const header = `// Auto-generated by MCPify — do not edit manually.\nimport { z } from 'zod';\n\n`;
  const schemas = tools.map(generateZodSchema).join('\n\n');
  const exportBlock =
    `\n\nexport type ToolInputs = {\n` +
    tools
      .map(t => `  ${t.name}: z.infer<typeof ${t.name}Schema>`)
      .join(';\n') +
    `;\n};\n`;
  return header + schemas + exportBlock;
}

/** Convert a TypeScript type string to a JSON Schema type string */
export function tsTypeToJsonSchemaType(tsType: string): string {
  const map: Record<string, string> = {
    string:  'string',
    number:  'number',
    boolean: 'boolean',
    Date:    'string',
    any:     'string',
    unknown: 'string',
    null:    'null',
  };
  return map[tsType.trim()] ?? 'string';
}
