// ─────────────────────────────────────────────────────────────────────────────
// NestJS decorator analyzer
//
// Reads `@Controller('base')` classes and their `@Get(':id')` / `@Post()` …
// method decorators, composing the full route path and pulling params from
// `@Param('id')`, `@Query('q')`, and `@Body()` parameter decorators.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Node,
  type Decorator,
  type MethodDeclaration,
  type ParameterDeclaration,
} from 'ts-morph';
import type { ExtractedTool } from '@mcpify/schema-engine';
import type { FrameworkAnalyzer, FrameworkContext } from './types.js';
import { buildRouteTool, joinRoutePath, shouldSkipSource } from './shared.js';

const HTTP_DECORATORS = new Map<string, string>([
  ['Get', 'get'],
  ['Post', 'post'],
  ['Put', 'put'],
  ['Patch', 'patch'],
  ['Delete', 'delete'],
  ['Options', 'options'],
  ['Head', 'head'],
  ['All', 'all'],
]);

export class NestAnalyzer implements FrameworkAnalyzer {
  readonly name = 'nestjs';

  detect(ctx: FrameworkContext): boolean {
    if (ctx.deps['@nestjs/core'] || ctx.deps['@nestjs/common']) return true;
    return ctx.project.getSourceFiles().some(sf => {
      if (shouldSkipSource(sf.getFilePath())) return false;
      return sf.getImportDeclarations().some(d =>
        d.getModuleSpecifierValue().startsWith('@nestjs/'),
      );
    });
  }

  extract(ctx: FrameworkContext): ExtractedTool[] {
    const tools: ExtractedTool[] = [];

    for (const sf of ctx.project.getSourceFiles()) {
      if (shouldSkipSource(sf.getFilePath())) continue;

      for (const cls of sf.getClasses()) {
        const controller = cls.getDecorator('Controller');
        if (!controller) continue;
        const base = decoratorPath(controller) ?? '';

        for (const method of cls.getMethods()) {
          for (const dec of method.getDecorators()) {
            const httpMethod = HTTP_DECORATORS.get(dec.getName());
            if (!httpMethod) continue;

            const routePath = joinRoutePath(base, decoratorPath(dec) ?? '');
            const { params, paramTypes } = nestParams(method);

            tools.push(buildRouteTool({
              method:     httpMethod,
              routePath,
              filePath:   sf.getFilePath(),
              framework:  this.name,
              params:     params.length > 0 ? params : undefined,
              paramTypes: params.length > 0 ? paramTypes : undefined,
              isAsync:    method.isAsync(),
              description: methodJsDoc(method),
            }));
            break; // one HTTP decorator per handler method
          }
        }
      }
    }

    return tools;
  }
}

/** First arg of a decorator as a path: string literal, or `{ path: '…' }`. */
function decoratorPath(dec: Decorator): string | null {
  const arg = dec.getArguments()[0];
  if (!arg) return null;
  if (Node.isStringLiteral(arg)) return arg.getLiteralText();
  if (Node.isObjectLiteralExpression(arg)) {
    const pathProp = arg.getProperty('path');
    if (pathProp && Node.isPropertyAssignment(pathProp)) {
      const init = pathProp.getInitializer();
      if (init && Node.isStringLiteral(init)) return init.getLiteralText();
    }
  }
  return null;
}

/** Collect agent-facing params from a handler's decorated parameters. */
function nestParams(method: MethodDeclaration): { params: string[]; paramTypes: string[] } {
  const params: string[] = [];
  const paramTypes: string[] = [];

  for (const param of method.getParameters()) {
    for (const dec of param.getDecorators()) {
      const kind = dec.getName();
      const arg = dec.getArguments()[0];
      const argName = arg && Node.isStringLiteral(arg) ? arg.getLiteralText() : null;

      if (kind === 'Param' || kind === 'Query') {
        params.push(argName ?? param.getName());
        paramTypes.push(argName ? 'string' : paramTypeText(param) ?? 'object');
      } else if (kind === 'Body') {
        params.push(argName ?? 'body');
        paramTypes.push(argName ? 'string' : paramTypeText(param) ?? 'object');
      }
      // @Req/@Res/@Headers/@Ip/@Session are transport plumbing — not tool inputs.
    }
  }

  return { params, paramTypes };
}

function paramTypeText(param: ParameterDeclaration): string | null {
  const node = param.getTypeNode();
  return node ? node.getText() : null;
}

function methodJsDoc(method: MethodDeclaration): string {
  const docs = method.getJsDocs();
  return docs.length > 0 ? docs[0].getDescription().trim().replace(/\n/g, ' ') : '';
}
