// ─────────────────────────────────────────────────────────────────────────────
// @mcpify/backend-analyzer
//
// Scans TypeScript / JavaScript source files using ts-morph to extract all
// exported functions (regular and arrow), their parameters, types, JSDoc, and
// HTTP metadata.  Also converts OpenAPI / Swagger specs into ExtractedTool[].
// ─────────────────────────────────────────────────────────────────────────────

import {
  Project,
  SyntaxKind,
  FunctionDeclaration,
  ArrowFunction,
  Node,
  SourceFile,
  JSDoc,
  type ObjectLiteralExpression,
  type ParameterDeclaration,
} from 'ts-morph';
import path from 'path';
import fs from 'fs/promises';
import { glob } from 'glob';
import type { ExtractedTool } from '@mcpify/schema-engine';
import { runFrameworkAnalyzers } from './frameworks/index.js';

export * from './frameworks/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Reachability
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractOptions {
  /** Drop tools inferred to be internal helpers rather than reachable entry points. */
  onlyReachable?: boolean;
}

// Prefixes of exported functions that are almost always internal helpers, not
// agent-callable actions (converters, guards, formatters).
const INTERNAL_NAME = /^(is|has|should|format|parse|serialize|deserialize|sanitize|assert|clone|to[A-Z]|from[A-Z])/;

// Bare uppercase HTTP verbs are Next.js App Router route handler exports — the
// framework analyzer emits them as routes, so the generic scan must skip them.
const HTTP_VERB_EXPORT = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/;

/**
 * Best-effort guess at whether a tool is an external entry point. Route/API/
 * event/database/frontend tools are entry points by construction; a plain
 * exported backend function is treated as reachable when it is async (an I/O
 * action) and not named like a pure utility.
 */
export function inferReachable(tool: ExtractedTool): boolean {
  if (tool.httpMethod || tool.framework) return true;
  if (tool.source !== 'backend') return true;
  if (INTERNAL_NAME.test(tool.name)) return false;
  return tool.isAsync;
}

/** Keep only tools inferred to be externally reachable. */
export function filterReachable(tools: ExtractedTool[]): ExtractedTool[] {
  return tools.filter(t => (t.reachable ?? inferReachable(t)));
}

// ─────────────────────────────────────────────────────────────────────────────
// BackendAnalyzer
// ─────────────────────────────────────────────────────────────────────────────

export class BackendAnalyzer {
  private project: Project;

  constructor(private rootPath: string) {
    // Try to pick up the project's own tsconfig; fall back to a minimal in-memory config.
    const tsconfigPath = path.join(rootPath, 'tsconfig.json');

    try {
      this.project = new Project({
        tsConfigFilePath: tsconfigPath,
        skipAddingFilesFromTsConfig: false,
        skipFileDependencyResolution: true,
      });
    } catch {
      this.project = new Project({
        compilerOptions: {
          target:         99,  // ESNext
          strict:         true,
          allowJs:        true,
          checkJs:        false,
        },
        skipFileDependencyResolution: true,
      });
      // Manually add source files when no tsconfig exists
      this._addFilesManually();
    }
  }

  private _addFilesManually(): void {
    // fast-glob (used by ts-morph) needs POSIX separators even on Windows, so
    // normalize backslashes — path.join here would produce unmatchable patterns.
    const root = this.rootPath.replace(/\\/g, '/').replace(/\/$/, '');
    const ignoreDirs = [
      'node_modules', 'dist', 'build', '.next', '.svelte-kit',
      '.nuxt', 'coverage', 'out', '.turbo', '.mcpify',
    ];
    this.project.addSourceFilesAtPaths([
      `${root}/**/*.{ts,tsx,js,jsx}`,
      ...ignoreDirs.map(d => `!${root}/**/${d}/**`),
    ]);
  }

  async extract(opts: ExtractOptions = {}): Promise<ExtractedTool[]> {
    const tools: ExtractedTool[] = [];

    for (const sourceFile of this.project.getSourceFiles()) {
      if (this._shouldSkip(sourceFile)) continue;
      tools.push(...this._extractFromFile(sourceFile));
    }

    // ── Framework-aware route extraction (express, fastify, nest, next) ────────
    // These surface inline / non-exported HTTP handlers the generic scan misses
    // and carry httpMethod/httpPath so permissions can classify by verb.
    const { tools: frameworkTools } = runFrameworkAnalyzers({
      rootPath: this.rootPath,
      deps:     await this._readDeps(),
      project:  this.project,
    });

    const merged = this._deduplicate([...frameworkTools, ...tools]);

    // Tag externally-reachable tools vs internal helpers so callers can filter.
    for (const tool of merged) {
      if (tool.reachable === undefined) tool.reachable = inferReachable(tool);
    }

    return opts.onlyReachable ? merged.filter(t => t.reachable) : merged;
  }

  private async _readDeps(): Promise<Record<string, string>> {
    try {
      const raw = await fs.readFile(path.join(this.rootPath, 'package.json'), 'utf-8');
      const pkg = JSON.parse(raw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    } catch {
      return {};
    }
  }

  private _shouldSkip(sf: SourceFile): boolean {
    const p = sf.getFilePath();
    return (
      p.includes('node_modules') ||
      p.includes('/dist/') ||
      p.includes('/build/') ||
      p.includes('/.next/') ||
      p.includes('/.svelte-kit/') ||
      p.includes('/.nuxt/') ||
      p.includes('/coverage/') ||
      p.includes('/out/') ||
      p.includes('/.turbo/') ||
      p.includes('/.mcpify/') ||
      /\.(tsx|jsx)$/.test(p) ||
      /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(p) ||
      p.endsWith('.d.ts')
    );
  }

  private _extractFromFile(sf: SourceFile): ExtractedTool[] {
    const tools: ExtractedTool[] = [];

    // ── Exported function declarations ────────────────────────────────────────
    for (const fn of sf.getFunctions()) {
      if (!fn.isExported()) continue;
      const tool = this._fnDeclToTool(fn);
      if (tool) tools.push(tool);
    }

    // ── Exported arrow functions / function expressions ───────────────────────
    for (const varStmt of sf.getVariableStatements()) {
      if (!varStmt.isExported()) continue;
      for (const decl of varStmt.getDeclarations()) {
        const init = decl.getInitializer();
        if (!init) continue;
        const kind = init.getKind();
        if (
          kind === SyntaxKind.ArrowFunction ||
          kind === SyntaxKind.FunctionExpression
        ) {
          const tool = this._arrowToTool(
            decl.getName(),
            init as ArrowFunction,
            sf.getFilePath()
          );
          if (tool) tools.push(tool);
        }
      }
    }

    // ── Exported class methods (controllers, services) ────────────────────────
    for (const cls of sf.getClasses()) {
      if (!cls.isExported()) continue;
      for (const method of cls.getMethods()) {
        const scope = method.getScope();
        if (scope === 'private' || scope === 'protected') continue;
        const name = `${cls.getName()}_${method.getName()}`;
        const { names, types } = this._paramsOf(method.getParameters());
        tools.push({
          name,
          source:      'backend',
          description: this._extractJsDoc(method.getJsDocs()),
          params:      names,
          paramTypes:  types,
          returnType:  method.getReturnType().getText(),
          filePath:    sf.getFilePath(),
          permission:  'UNKNOWN',
          isAsync:     method.isAsync(),
          jsdocTags:   this._extractJsDocTags(method.getJsDocs()),
        });
      }
    }

    return tools;
  }

  private _fnDeclToTool(fn: FunctionDeclaration): ExtractedTool | null {
    const name = fn.getName();
    if (!name || name.startsWith('_') || HTTP_VERB_EXPORT.test(name)) return null;
    const { names, types } = this._paramsOf(fn.getParameters());
    return {
      name,
      source:      'backend',
      description: this._extractJsDoc(fn.getJsDocs()),
      params:      names,
      paramTypes:  types,
      returnType:  fn.getReturnType().getText().replace(/^Promise<(.+)>$/, '$1'),
      filePath:    fn.getSourceFile().getFilePath(),
      permission:  'UNKNOWN',
      isAsync:     fn.isAsync(),
      jsdocTags:   this._extractJsDocTags(fn.getJsDocs()),
    };
  }

  private _arrowToTool(
    name: string,
    fn: ArrowFunction,
    filePath: string
  ): ExtractedTool | null {
    if (!name || name.startsWith('_') || HTTP_VERB_EXPORT.test(name)) return null;
    const { names, types } = this._paramsOf(fn.getParameters());
    return {
      name,
      source:      'backend',
      description: '',
      params:      names,
      paramTypes:  types,
      returnType:  fn.getReturnType().getText().replace(/^Promise<(.+)>$/, '$1'),
      filePath,
      permission:  'UNKNOWN',
      isAsync:     fn.isAsync(),
    };
  }

  private _extractJsDoc(docs: JSDoc[]): string {
    if (docs.length === 0) return '';
    return docs[0].getDescription().trim().replace(/\n/g, ' ');
  }

  private _extractJsDocTags(docs: JSDoc[]): Record<string, string> {
    const tags: Record<string, string> = {};
    for (const doc of docs) {
      for (const tag of doc.getTags()) {
        tags[tag.getTagName()] = tag.getCommentText() ?? '';
      }
    }
    return tags;
  }

  /**
   * Resolve a parameter list into flat name/type arrays. Destructured object
   * params (`{ a, b }: T`) are expanded into their individual fields so each
   * becomes a typed schema property instead of an opaque `payload_N`.
   */
  private _paramsOf(parameters: ParameterDeclaration[]): { names: string[]; types: string[] } {
    const names: string[] = [];
    const types: string[] = [];

    parameters.forEach((param, i) => {
      const nameNode = param.getNameNode();
      if (Node.isObjectBindingPattern(nameNode)) {
        const elements = nameNode.getElements();
        if (elements.length === 0) {
          names.push(`payload_${i}`);
          types.push(param.getType().getText());
          return;
        }
        for (const el of elements) {
          if (el.getDotDotDotToken()) continue; // skip `...rest`
          names.push(el.getName());
          types.push(el.getType().getText());
        }
      } else {
        names.push(this._sanitizeParamName(param.getName(), i));
        types.push(param.getType().getText());
      }
    });

    return { names, types };
  }

  private _sanitizeParamName(name: string, index: number): string {
    if (name.startsWith('{') || name.startsWith('[')) {
      return `payload_${index}`;
    }
    return name;
  }

  private _deduplicate(tools: ExtractedTool[]): ExtractedTool[] {
    const seen = new Set<string>();
    return tools.filter(t => {
      if (seen.has(t.name)) return false;
      seen.add(t.name);
      return true;
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SwaggerConverter  —  OpenAPI 2 / 3 → ExtractedTool[]
// ─────────────────────────────────────────────────────────────────────────────

export class SwaggerConverter {
  static async fromFile(filePath: string): Promise<ExtractedTool[]> {
    // Dynamic import so the package isn't loaded unless needed
    const SwaggerParser = (await import('@apidevtools/swagger-parser')).default;
    const api = (await SwaggerParser.validate(filePath)) as any;
    return SwaggerConverter._parseApi(api, filePath);
  }

  static async fromUrl(url: string): Promise<ExtractedTool[]> {
    const SwaggerParser = (await import('@apidevtools/swagger-parser')).default;
    const api = (await SwaggerParser.validate(url)) as any;
    return SwaggerConverter._parseApi(api, url);
  }

  static async fromObject(spec: Record<string, unknown>): Promise<ExtractedTool[]> {
    const SwaggerParser = (await import('@apidevtools/swagger-parser')).default;
    const api = (await SwaggerParser.validate(spec as any)) as any;
    return SwaggerConverter._parseApi(api, '<inline>');
  }

  private static _parseApi(api: any, source: string): ExtractedTool[] {
    const tools: ExtractedTool[] = [];

    for (const [routePath, pathItem] of Object.entries<any>(api.paths ?? {})) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head'] as const) {
        const op = pathItem[method];
        if (!op) continue;

        const operationId =
          op.operationId ??
          `${method}_${routePath
            .replace(/\//g, '_')
            .replace(/[{}]/g, '')
            .replace(/^_/, '')}`;

        const allParams: any[] = [
          ...(pathItem.parameters ?? []),
          ...(op.parameters ?? []),
        ];

        // Body params from requestBody (OpenAPI 3)
        const bodyParams: string[] = [];
        const bodyTypes: string[] = [];
        if (op.requestBody?.content) {
          const jsonContent =
            op.requestBody.content['application/json'] ??
            op.requestBody.content['*/*'];
          if (jsonContent?.schema?.properties) {
            for (const [propName, propSchema] of Object.entries<any>(
              jsonContent.schema.properties
            )) {
              bodyParams.push(propName);
              bodyTypes.push(propSchema.type ?? 'unknown');
            }
          }
        }

        tools.push({
          name:        SwaggerConverter._toCamel(operationId),
          source:      'api',
          description: op.summary ?? op.description ?? '',
          params: [
            ...allParams.map((p: any) => p.name),
            ...bodyParams,
          ],
          paramTypes: [
            ...allParams.map((p: any) => p.schema?.type ?? p.type ?? 'string'),
            ...bodyTypes,
          ],
          returnType:  'unknown',
          filePath:    source,
          permission:  'UNKNOWN',
          isAsync:     true,
          httpMethod:  method.toUpperCase(),
          httpPath:    routePath,
          jsdocTags:   op.tags ? { tags: op.tags.join(', ') } : {},
        });
      }
    }

    return tools;
  }

  private static _toCamel(str: string): string {
    return str
      .replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase())
      .replace(/^(.)/, c => c.toLowerCase());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PrismaAnalyzer  —  Prisma schema → CRUD ExtractedTool[]
// ─────────────────────────────────────────────────────────────────────────────

export class PrismaAnalyzer {
  constructor(private schemaPath: string) {}

  async extract(): Promise<ExtractedTool[]> {
    let content: string;
    try {
      content = await fs.readFile(this.schemaPath, 'utf-8');
    } catch {
      return [];
    }
    return this._parseModels(content);
  }

  private _parseModels(schema: string): ExtractedTool[] {
    const tools: ExtractedTool[] = [];

    for (const { name: modelName, body } of prismaBlocks(schema, 'model')) {
      const fields = parsePrismaFields(body);
      const scalarFields = fields.filter(f => !f.isRelation);

      const idField = fields.find(f => f.isId) ?? scalarFields.find(f => f.name === 'id') ?? scalarFields[0];
      const idParam = idField?.name ?? 'id';
      const noun = modelName.toLowerCase();
      const writable = scalarFields.filter(f => f.name !== idParam);

      tools.push(
        this._tool(`get${modelName}ById`, `Fetch a single ${noun} by ${idParam}`, [idParam], ['string']),
        this._tool(`list${modelName}s`,   `List all ${noun}s with optional pagination`, ['skip', 'take'], ['number', 'number']),
        this._tool(`create${modelName}`,  `Create a new ${noun} record`, writable.map(f => f.name), writable.map(f => f.tsType)),
        this._tool(`update${modelName}`,  `Update an existing ${noun}`, [idParam, 'data'], ['string', 'object']),
        this._tool(`delete${modelName}`,  `Delete a ${noun} record`, [idParam], ['string']),
      );

      // Field-aware finders for common lookup columns.
      for (const field of scalarFields) {
        if (!['status', 'email', 'slug', 'role'].includes(field.name)) continue;
        tools.push(this._tool(
          `get${modelName}sBy${field.name.charAt(0).toUpperCase()}${field.name.slice(1)}`,
          `List ${noun}s filtered by ${field.name}`,
          [field.name],
          [field.tsType],
        ));
      }
    }

    return tools;
  }

  private _tool(
    name: string,
    description: string,
    params: string[],
    paramTypes: string[]
  ): ExtractedTool {
    return {
      name,
      source:      'database',
      description,
      params,
      paramTypes,
      returnType:  'unknown',
      filePath:    this.schemaPath,
      permission:  'UNKNOWN',
      isAsync:     true,
    };
  }
}

// DrizzleAnalyzer - Drizzle table definitions -> CRUD ExtractedTool[]

export class DrizzleAnalyzer {
  constructor(private targetPath: string) {}

  async extract(): Promise<ExtractedTool[]> {
    const files = await this._resolveFiles();
    const tools: ExtractedTool[] = [];

    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
      compilerOptions: {
        allowJs: true,
        checkJs: false,
      },
    });

    project.addSourceFilesAtPaths(files);

    for (const sourceFile of project.getSourceFiles()) {
      for (const declaration of sourceFile.getVariableDeclarations()) {
        const initializer = declaration.getInitializer();
        if (!initializer || !Node.isCallExpression(initializer)) continue;

        const callee = initializer.getExpression().getText();
        if (!/(^|\.)(pgTable|sqliteTable|mysqlTable)$/.test(callee)) continue;

        const args = initializer.getArguments();
        const columnsArg = args[1];
        if (!columnsArg || !Node.isObjectLiteralExpression(columnsArg)) continue;

        const modelName = singularPascal(declaration.getName());
        const fields = columnsArg.getProperties().flatMap(property => {
          if (!Node.isPropertyAssignment(property)) return [];
          const name = property.getName().replace(/^['"]|['"]$/g, '');
          const type = drizzleColumnType(property.getInitializer()?.getText() ?? '');
          return [{ name, type }];
        });

        tools.push(...databaseTools(modelName, fields, sourceFile.getFilePath()));
      }
    }

    return dedupeTools(tools);
  }

  private async _resolveFiles(): Promise<string[]> {
    const stat = await fs.stat(this.targetPath).catch(() => null);
    if (!stat) return [];
    if (stat.isFile()) return [this.targetPath];

    return glob('**/*.{ts,tsx,js,jsx}', {
      cwd: this.targetPath,
      absolute: true,
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.mcpify/**',
        '**/*.test.*',
        '**/*.spec.*',
      ],
    });
  }
}

// MongooseAnalyzer - Mongoose Schema/model declarations -> CRUD ExtractedTool[]

export class MongooseAnalyzer {
  constructor(private targetPath: string) {}

  async extract(): Promise<ExtractedTool[]> {
    const files = await this._resolveFiles();
    const tools: ExtractedTool[] = [];

    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        allowJs: true,
        checkJs: false,
      },
    });

    project.addSourceFilesAtPaths(files);

    for (const sourceFile of project.getSourceFiles()) {
      const schemas = new Map<string, DbField[]>();

      for (const declaration of sourceFile.getVariableDeclarations()) {
        const initializer = declaration.getInitializer();
        const fields = initializer ? mongooseSchemaFields(initializer) : [];
        if (fields.length > 0) schemas.set(declaration.getName(), fields);
      }

      for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const expression = call.getExpression().getText();
        if (expression !== 'model' && expression !== 'mongoose.model') continue;

        const args = call.getArguments();
        const modelArg = args[0];
        const schemaArg = args[1];
        if (!modelArg || !Node.isStringLiteral(modelArg) || !schemaArg) continue;

        const modelName = singularPascal(modelArg.getLiteralText());
        const fields = Node.isIdentifier(schemaArg)
          ? schemas.get(schemaArg.getText()) ?? []
          : mongooseSchemaFields(schemaArg);

        if (fields.length > 0) {
          tools.push(...databaseTools(modelName, fields, sourceFile.getFilePath()));
        }
      }
    }

    return dedupeTools(tools);
  }

  private async _resolveFiles(): Promise<string[]> {
    const stat = await fs.stat(this.targetPath).catch(() => null);
    if (!stat) return [];
    if (stat.isFile()) return [this.targetPath];

    return glob('**/*.{ts,tsx,js,jsx}', {
      cwd: this.targetPath,
      absolute: true,
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/.svelte-kit/**',
        '**/.nuxt/**',
        '**/coverage/**',
        '**/out/**',
        '**/.turbo/**',
        '**/.mcpify/**',
        '**/*.test.*',
        '**/*.spec.*',
      ],
    });
  }
}

interface DbField {
  name: string;
  type: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma schema parsing
// ─────────────────────────────────────────────────────────────────────────────

interface PrismaField {
  name: string;
  tsType: string;
  isRelation: boolean;
  isId: boolean;
}

const PRISMA_SCALARS = new Set([
  'String', 'Boolean', 'Int', 'BigInt', 'Float', 'Decimal', 'DateTime', 'Json', 'Bytes',
]);

/** Extract top-level `keyword Name { … }` blocks with brace balancing (handles nested `{}`). */
function prismaBlocks(schema: string, keyword: string): { name: string; body: string }[] {
  const blocks: { name: string; body: string }[] = [];
  const re = new RegExp(`\\b${keyword}\\s+(\\w+)\\s*\\{`, 'g');
  let m: RegExpExecArray | null;

  while ((m = re.exec(schema)) !== null) {
    const start = re.lastIndex; // index just past the opening brace
    let depth = 1;
    let i = start;
    for (; i < schema.length && depth > 0; i++) {
      if (schema[i] === '{') depth++;
      else if (schema[i] === '}') depth--;
    }
    blocks.push({ name: m[1], body: schema.slice(start, i - 1) });
    re.lastIndex = i;
  }
  return blocks;
}

function parsePrismaFields(body: string): PrismaField[] {
  const fields: PrismaField[] = [];

  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('@@')) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const name = parts[0];
    if (!/^[A-Za-z_]\w*$/.test(name)) continue;

    const rawType = parts[1];
    const isArray = rawType.endsWith('[]');
    const baseType = rawType.replace(/[[\]?]/g, '');
    const isScalar = PRISMA_SCALARS.has(baseType);
    // A relation is a model-typed field: non-scalar and either an explicit
    // @relation or a list of a non-scalar type. Non-scalar singulars without
    // @relation are treated as enums (scalar-ish → string).
    const isRelation = !isScalar && (line.includes('@relation') || isArray);

    fields.push({
      name,
      tsType:     prismaTsType(baseType, isArray, isScalar),
      isRelation,
      isId:       line.includes('@id'),
    });
  }

  return fields;
}

function prismaTsType(baseType: string, isArray: boolean, isScalar: boolean): string {
  const scalar =
    baseType === 'String'   ? 'string' :
    baseType === 'Boolean'  ? 'boolean' :
    baseType === 'DateTime' ? 'Date' :
    baseType === 'Json'     ? 'object' :
    (['Int', 'BigInt', 'Float', 'Decimal'].includes(baseType)) ? 'number' :
    isScalar ? 'string' : 'string'; // Bytes + enums → string
  return isArray ? `${scalar}[]` : scalar;
}

function databaseTools(modelName: string, fields: DbField[], filePath: string): ExtractedTool[] {
  const idField = fields.find(field => field.name === 'id' || field.name === '_id') ?? fields[0];
  const idParam = idField?.name ?? 'id';
  const noun = modelName.toLowerCase();
  const pluralSuffix = modelName.endsWith('s') ? 'es' : 's';
  const writableFields = fields.filter(field => field.name !== 'id' && field.name !== '_id');

  const tools: ExtractedTool[] = [
    databaseTool(`get${modelName}ById`, `Fetch a single ${noun} by ${idParam}`, [idParam], ['string'], filePath),
    databaseTool(`list${modelName}${pluralSuffix}`, `List all ${noun}${pluralSuffix} with optional pagination`, ['skip', 'take'], ['number', 'number'], filePath),
    databaseTool(`create${modelName}`, `Create a new ${noun} record`, writableFields.map(field => field.name), writableFields.map(field => field.type), filePath),
    databaseTool(`update${modelName}`, `Update an existing ${noun}`, [idParam, 'data'], ['string', 'object'], filePath),
    databaseTool(`delete${modelName}`, `Delete a ${noun} record`, [idParam], ['string'], filePath),
  ];

  for (const field of fields) {
    if (!['status', 'email', 'slug', 'role'].includes(field.name)) continue;
    tools.push(databaseTool(
      `get${modelName}${pluralSuffix}By${pascal(field.name)}`,
      `List ${noun}${pluralSuffix} filtered by ${field.name}`,
      [field.name],
      [field.type],
      filePath
    ));
  }

  return tools;
}

function databaseTool(
  name: string,
  description: string,
  params: string[],
  paramTypes: string[],
  filePath: string
): ExtractedTool {
  return {
    name,
    source: 'database',
    description,
    params,
    paramTypes,
    returnType: 'unknown',
    filePath,
    permission: 'UNKNOWN',
    isAsync: true,
  };
}

function drizzleColumnType(text: string): string {
  const lower = text.toLowerCase();
  if (/boolean/.test(lower)) return 'boolean';
  if (/date|timestamp/.test(lower)) return 'Date';
  if (/json|jsonb/.test(lower)) return 'object';
  if (/integer|serial|bigint|numeric|decimal|real|double|float/.test(lower)) return 'number';
  return 'string';
}

function mongooseSchemaFields(node: Node): DbField[] {
  if (Node.isNewExpression(node)) {
    const expression = node.getExpression().getText();
    if (expression !== 'Schema' && expression !== 'mongoose.Schema') return [];
    const firstArg = node.getArguments()[0];
    return firstArg && Node.isObjectLiteralExpression(firstArg)
      ? mongooseObjectFields(firstArg)
      : [];
  }

  if (Node.isCallExpression(node)) {
    const expression = node.getExpression().getText();
    if (expression !== 'Schema' && expression !== 'mongoose.Schema') return [];
    const firstArg = node.getArguments()[0];
    return firstArg && Node.isObjectLiteralExpression(firstArg)
      ? mongooseObjectFields(firstArg)
      : [];
  }

  return [];
}

function mongooseObjectFields(objectLiteral: ObjectLiteralExpression): DbField[] {
  return objectLiteral.getProperties().flatMap(property => {
    if (!Node.isPropertyAssignment(property)) return [];

    const name = property.getName().replace(/^['"]|['"]$/g, '');
    const initializer = property.getInitializer();
    if (!initializer) return [];

    return [{
      name,
      type: mongooseFieldType(initializer.getText()),
    }];
  });
}

function mongooseFieldType(text: string): string {
  if (/\bBoolean\b|type:\s*Boolean/.test(text)) return 'boolean';
  if (/\bNumber\b|type:\s*Number/.test(text)) return 'number';
  if (/\bDate\b|type:\s*Date/.test(text)) return 'Date';
  if (/\bObjectId\b|Types\.ObjectId|Schema\.Types\.ObjectId/.test(text)) return 'string';
  if (/^\s*\[/.test(text)) return 'unknown[]';
  if (/\bMixed\b|type:\s*Object/.test(text)) return 'object';
  return 'string';
}

function dedupeTools(tools: ExtractedTool[]): ExtractedTool[] {
  const seen = new Set<string>();
  return tools.filter(tool => {
    if (seen.has(tool.name)) return false;
    seen.add(tool.name);
    return true;
  });
}

function singularPascal(name: string): string {
  const normalized = name
    .replace(/Schema$/, '')
    .replace(/Model$/, '')
    .replace(/Table$/, '');
  const singular = normalized.endsWith('ies')
    ? `${normalized.slice(0, -3)}y`
    : normalized.endsWith('s') && normalized.length > 1 && !normalized.endsWith('ss') && !normalized.endsWith('us') && !normalized.endsWith('is')
      ? normalized.slice(0, -1)
      : normalized;
  return pascal(singular);
}

function pascal(name: string): string {
  return name
    .replace(/[_\-\s]+(.)/g, (_, char) => char.toUpperCase())
    .replace(/^(.)/, char => char.toUpperCase());
}
