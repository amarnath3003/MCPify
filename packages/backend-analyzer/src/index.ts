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
} from 'ts-morph';
import path from 'path';
import fs from 'fs/promises';
import { glob } from 'glob';
import type { ExtractedTool } from '@mcpify/schema-engine';

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
    const patterns = ['**/*.ts', '**/*.js'];
    const ignores = [
      '!' + path.join(this.rootPath, '**/node_modules/**'),
      '!' + path.join(this.rootPath, '**/dist/**'),
      '!' + path.join(this.rootPath, '**/build/**'),
      '!' + path.join(this.rootPath, '**/.next/**'),
      '!' + path.join(this.rootPath, '**/.svelte-kit/**'),
      '!' + path.join(this.rootPath, '**/.nuxt/**'),
      '!' + path.join(this.rootPath, '**/coverage/**'),
      '!' + path.join(this.rootPath, '**/out/**'),
      '!' + path.join(this.rootPath, '**/.turbo/**'),
      '!' + path.join(this.rootPath, '**/.mcpify/**'),
    ];
    for (const pattern of patterns) {
      // glob sync via addSourceFilesFromTsConfig fallback
      this.project.addSourceFilesAtPaths([
        path.join(this.rootPath, pattern),
        ...ignores,
      ]);
    }
  }

  async extract(): Promise<ExtractedTool[]> {
    const tools: ExtractedTool[] = [];

    for (const sourceFile of this.project.getSourceFiles()) {
      if (this._shouldSkip(sourceFile)) continue;
      tools.push(...this._extractFromFile(sourceFile));
    }

    return this._deduplicate(tools);
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
        tools.push({
          name,
          source:      'backend',
          description: this._extractJsDoc(method.getJsDocs()),
          params:      method.getParameters().map((p, i) => this._sanitizeParamName(p.getName(), i)),
          paramTypes:  method.getParameters().map(p => p.getType().getText()),
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
    if (!name || name.startsWith('_')) return null;
    return {
      name,
      source:      'backend',
      description: this._extractJsDoc(fn.getJsDocs()),
      params:      fn.getParameters().map((p, i) => this._sanitizeParamName(p.getName(), i)),
      paramTypes:  fn.getParameters().map(p => p.getType().getText()),
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
    if (!name || name.startsWith('_')) return null;
    return {
      name,
      source:      'backend',
      description: '',
      params:      fn.getParameters().map((p, i) => this._sanitizeParamName(p.getName(), i)),
      paramTypes:  fn.getParameters().map(p => p.getType().getText()),
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
    const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
    let match: RegExpExecArray | null;

    while ((match = modelRegex.exec(schema)) !== null) {
      const modelName = match[1];
      const body = match[2];

      // Parse fields
      const fieldLines = body
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('//') && !l.startsWith('@@'));

      const fields = fieldLines
        .map(line => {
          const parts = line.split(/\s+/);
          return parts.length >= 2
            ? { name: parts[0], type: parts[1].replace('?', '') }
            : null;
        })
        .filter(Boolean) as { name: string; type: string }[];

      const idField = fields.find(f => f.name === 'id') ?? fields[0];
      const noun = modelName.toLowerCase();
      const idParam = idField?.name ?? 'id';

      // Generate standard CRUD operations
      tools.push(
        this._tool(`get${modelName}ById`,  `Fetch a single ${noun} by ${idParam}`, [idParam], ['string']),
        this._tool(`list${modelName}s`,    `List all ${noun}s with optional pagination`, ['skip', 'take'], ['number', 'number']),
        this._tool(`create${modelName}`,   `Create a new ${noun} record`, fields.filter(f => f.name !== 'id').map(f => f.name), fields.filter(f => f.name !== 'id').map(f => f.type.toLowerCase())),
        this._tool(`update${modelName}`,   `Update an existing ${noun}`, [idParam, 'data'], ['string', 'object']),
        this._tool(`delete${modelName}`,   `Delete a ${noun} record`, [idParam], ['string']),
      );

      // Status-aware list if a `status` field exists
      if (fields.some(f => f.name === 'status')) {
        tools.push(
          this._tool(
            `get${modelName}sByStatus`,
            `List ${noun}s filtered by status`,
            ['status'],
            ['string']
          )
        );
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
