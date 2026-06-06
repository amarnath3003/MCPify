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
      });
    } catch {
      this.project = new Project({
        compilerOptions: {
          target:         99,  // ESNext
          strict:         true,
          allowJs:        true,
          checkJs:        false,
        },
      });
      // Manually add source files when no tsconfig exists
      this._addFilesManually();
    }
  }

  private _addFilesManually(): void {
    const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
    for (const pattern of patterns) {
      // glob sync via addSourceFilesFromTsConfig fallback
      this.project.addSourceFilesAtPaths(
        path.join(this.rootPath, pattern)
      );
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
      p.includes('/.mcpify/') ||
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
        if (method.getScope() !== 'public' && method.getScope() !== undefined) continue;
        const name = `${cls.getName()}_${method.getName()}`;
        tools.push({
          name,
          source:      'backend',
          description: this._extractJsDoc(method.getJsDocs()),
          params:      method.getParameters().map(p => p.getName()),
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
      params:      fn.getParameters().map(p => p.getName()),
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
      params:      fn.getParameters().map(p => p.getName()),
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
