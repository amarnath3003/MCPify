// ─────────────────────────────────────────────────────────────────────────────
// Next.js analyzer
//
//  • App Router route handlers  — app/**/route.ts exporting GET/POST/… →
//    an HTTP tool with the path derived from the file's directory.
//  • Pages API routes           — pages/api/**/*.ts default export handler.
//  • Server actions             — files/functions marked 'use server';
//    exported async functions become reachable backend tools.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Node,
  SyntaxKind,
  type SourceFile,
  type FunctionDeclaration,
} from 'ts-morph';
import type { ExtractedTool } from '@mcpify/schema-engine';
import type { FrameworkAnalyzer, FrameworkContext } from './types.js';
import { HTTP_METHODS, buildRouteTool, shouldSkipSource } from './shared.js';

const VERB_EXPORTS = new Set(
  HTTP_METHODS.filter(m => m !== 'all').map(m => m.toUpperCase()),
);

export class NextAnalyzer implements FrameworkAnalyzer {
  readonly name = 'next';

  detect(ctx: FrameworkContext): boolean {
    if (ctx.deps.next) return true;
    return ctx.project.getSourceFiles().some(sf => {
      const p = sf.getFilePath().replace(/\\/g, '/');
      return /\/app\/.*\/route\.(ts|js)$/.test(p) || /\/pages\/api\//.test(p);
    });
  }

  extract(ctx: FrameworkContext): ExtractedTool[] {
    const tools: ExtractedTool[] = [];

    for (const sf of ctx.project.getSourceFiles()) {
      const p = sf.getFilePath().replace(/\\/g, '/');
      if (shouldSkipSource(p)) continue;

      if (/\/route\.(ts|js)$/.test(p) && /\/app\//.test(p)) {
        tools.push(...routeHandlerTools(sf, appRoutePath(p)));
      } else if (/\/pages\/api\//.test(p)) {
        const tool = pagesApiTool(sf, pagesApiPath(p));
        if (tool) tools.push(tool);
      } else if (hasUseServer(sf)) {
        tools.push(...serverActionTools(sf));
      }
    }

    return tools;
  }
}

// ── App Router route handlers ──────────────────────────────────────────────────

function routeHandlerTools(sf: SourceFile, routePath: string): ExtractedTool[] {
  const tools: ExtractedTool[] = [];
  const filePath = sf.getFilePath();

  const verbNames = new Set<string>();
  for (const fn of sf.getFunctions()) {
    if (fn.isExported() && fn.getName() && VERB_EXPORTS.has(fn.getName()!)) {
      verbNames.add(fn.getName()!);
    }
  }
  for (const stmt of sf.getVariableStatements()) {
    if (!stmt.isExported()) continue;
    for (const decl of stmt.getDeclarations()) {
      if (VERB_EXPORTS.has(decl.getName())) verbNames.add(decl.getName());
    }
  }

  for (const verb of verbNames) {
    tools.push(buildRouteTool({
      method:    verb.toLowerCase(),
      routePath,
      filePath,
      framework: 'next',
    }));
  }
  return tools;
}

// ── Pages API routes ───────────────────────────────────────────────────────────

function pagesApiTool(sf: SourceFile, routePath: string): ExtractedTool | null {
  const hasDefaultExport = sf.getDescendantsOfKind(SyntaxKind.ExportAssignment).length > 0
    || sf.getFunctions().some(f => f.isDefaultExport())
    || sf.getExportedDeclarations().has('default');
  if (!hasDefaultExport) return null;

  return buildRouteTool({
    method:    'all',
    routePath,
    filePath:  sf.getFilePath(),
    framework: 'next',
  });
}

// ── Server actions ─────────────────────────────────────────────────────────────

function serverActionTools(sf: SourceFile): ExtractedTool[] {
  const tools: ExtractedTool[] = [];
  const filePath = sf.getFilePath();

  for (const fn of sf.getFunctions()) {
    if (!fn.isExported()) continue;
    const name = fn.getName();
    if (!name || name.startsWith('_')) continue;
    tools.push(fnToServerAction(fn, name, filePath));
  }

  for (const stmt of sf.getVariableStatements()) {
    if (!stmt.isExported()) continue;
    for (const decl of stmt.getDeclarations()) {
      const init = decl.getInitializer();
      if (!init) continue;
      if (!Node.isArrowFunction(init) && !Node.isFunctionExpression(init)) continue;
      const name = decl.getName();
      if (name.startsWith('_')) continue;
      tools.push({
        name,
        source:     'backend',
        description: '',
        params:      init.getParameters().map(p => p.getName()),
        paramTypes:  init.getParameters().map(p => p.getTypeNode()?.getText() ?? 'unknown'),
        returnType:  'unknown',
        filePath,
        permission:  'UNKNOWN',
        isAsync:     init.isAsync(),
        framework:   'next',
        reachable:   true,
      });
    }
  }

  return tools;
}

function fnToServerAction(fn: FunctionDeclaration, name: string, filePath: string): ExtractedTool {
  return {
    name,
    source:     'backend',
    description: '',
    params:      fn.getParameters().map(p => p.getName()),
    paramTypes:  fn.getParameters().map(p => p.getTypeNode()?.getText() ?? 'unknown'),
    returnType:  'unknown',
    filePath,
    permission:  'UNKNOWN',
    isAsync:     fn.isAsync(),
    framework:   'next',
    reachable:   true,
  };
}

// ── Path + directive helpers ────────────────────────────────────────────────────

function hasUseServer(sf: SourceFile): boolean {
  const first = sf.getStatements()[0];
  if (first && Node.isExpressionStatement(first)) {
    const expr = first.getExpression();
    if (Node.isStringLiteral(expr) && expr.getLiteralText() === 'use server') return true;
  }
  return false;
}

/** app/(group)/users/[id]/route.ts → /users/:id */
function appRoutePath(filePath: string): string {
  const afterApp = filePath.replace(/.*\/app\//, '').replace(/\/route\.(ts|js)$/, '');
  return normalizeSegments(afterApp);
}

/** pages/api/users/[id].ts → /api/users/:id */
function pagesApiPath(filePath: string): string {
  const afterApi = filePath
    .replace(/.*\/pages\/api\/?/, '')
    .replace(/\.(ts|tsx|js|jsx)$/, '')
    .replace(/\/index$/, '')
    .replace(/^index$/, '');
  return '/api' + normalizeSegments(afterApi);
}

function normalizeSegments(rel: string): string {
  const segments = rel
    .split('/')
    .filter(Boolean)
    .filter(seg => !/^\(.*\)$/.test(seg)) // drop route groups (marketing)
    .map(seg =>
      seg
        .replace(/^\[\.{3}(.+)\]$/, ':$1') // [...slug] → :slug
        .replace(/^\[(.+)\]$/, ':$1'),      // [id]       → :id
    );
  return '/' + segments.join('/');
}
