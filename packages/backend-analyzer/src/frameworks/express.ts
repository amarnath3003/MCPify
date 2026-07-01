// ─────────────────────────────────────────────────────────────────────────────
// Express route analyzer
//
// Finds `app.get('/x', handler)` / `router.post('/y', handler)` registrations —
// including inline, non-exported handlers the generic export scan cannot see —
// and resolves one level of `app.use('/base', router)` mount prefixes.
// ─────────────────────────────────────────────────────────────────────────────

import { Node, SyntaxKind, type SourceFile, type Node as TsNode } from 'ts-morph';
import type { ExtractedTool } from '@mcpify/schema-engine';
import type { FrameworkAnalyzer, FrameworkContext } from './types.js';
import { HTTP_METHODS, buildRouteTool, joinRoutePath, shouldSkipSource } from './shared.js';

const METHOD_SET = new Set<string>(HTTP_METHODS);

export class ExpressAnalyzer implements FrameworkAnalyzer {
  readonly name = 'express';

  detect(ctx: FrameworkContext): boolean {
    if (ctx.deps.express) return true;
    return ctx.project.getSourceFiles().some(sf => {
      if (shouldSkipSource(sf.getFilePath())) return false;
      return (
        sf.getImportDeclarations().some(d => d.getModuleSpecifierValue() === 'express') ||
        /require\(\s*['"]express['"]\s*\)/.test(sf.getText())
      );
    });
  }

  extract(ctx: FrameworkContext): ExtractedTool[] {
    const tools: ExtractedTool[] = [];

    for (const sf of ctx.project.getSourceFiles()) {
      if (shouldSkipSource(sf.getFilePath())) continue;
      const mounts = collectMounts(sf);

      for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const expr = call.getExpression();
        if (!Node.isPropertyAccessExpression(expr)) continue;

        const method = expr.getName().toLowerCase();
        if (!METHOD_SET.has(method)) continue;

        const args = call.getArguments();
        const first = args[0];
        // Route registration: string path + at least one handler that isn't a string
        // (excludes `map.get('key')` and `app.get('setting')` accessor calls).
        if (!first || !Node.isStringLiteral(first)) continue;
        if (!first.getLiteralText().startsWith('/')) continue;
        if (args.length < 2 || Node.isStringLiteral(args[1])) continue;

        const objName = expr.getExpression().getText();
        const routePath = joinRoutePath(mounts.get(objName) ?? '', first.getLiteralText());
        const isAsync = args.slice(1).some(isAsyncHandler);

        tools.push(buildRouteTool({
          method,
          routePath,
          filePath:  sf.getFilePath(),
          framework: this.name,
          isAsync,
        }));
      }
    }

    return tools;
  }
}

/** Map router variable name → mount base path from `X.use('/base', router)`. */
function collectMounts(sf: SourceFile): Map<string, string> {
  const mounts = new Map<string, string>();
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) continue;
    if (expr.getName() !== 'use') continue;

    const args = call.getArguments();
    const base = args[0];
    const router = args[1];
    if (!base || !Node.isStringLiteral(base) || !router) continue;
    if (!base.getLiteralText().startsWith('/')) continue;
    if (Node.isIdentifier(router)) {
      mounts.set(router.getText(), base.getLiteralText());
    }
  }
  return mounts;
}

/** True when a handler argument is a syntactically async function. */
export function isAsyncHandler(node: TsNode): boolean {
  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
    return node.isAsync();
  }
  return false;
}
