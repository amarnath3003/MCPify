// ─────────────────────────────────────────────────────────────────────────────
// Fastify route analyzer
//
// Handles both the shorthand form `fastify.get('/x', opts?, handler)` and the
// full form `fastify.route({ method, url, schema, handler })`. When a JSON
// schema is present its body/querystring/params properties become real tool
// params instead of a generic `body`.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Node,
  SyntaxKind,
  type ObjectLiteralExpression,
  type Node as TsNode,
} from 'ts-morph';
import type { ExtractedTool } from '@mcpify/schema-engine';
import type { FrameworkAnalyzer, FrameworkContext } from './types.js';
import { HTTP_METHODS, buildRouteTool, shouldSkipSource } from './shared.js';

const METHOD_SET = new Set<string>(HTTP_METHODS);

export class FastifyAnalyzer implements FrameworkAnalyzer {
  readonly name = 'fastify';

  detect(ctx: FrameworkContext): boolean {
    if (ctx.deps.fastify) return true;
    return ctx.project.getSourceFiles().some(sf => {
      if (shouldSkipSource(sf.getFilePath())) return false;
      return (
        sf.getImportDeclarations().some(d => d.getModuleSpecifierValue() === 'fastify') ||
        /require\(\s*['"]fastify['"]\s*\)/.test(sf.getText())
      );
    });
  }

  extract(ctx: FrameworkContext): ExtractedTool[] {
    const tools: ExtractedTool[] = [];

    for (const sf of ctx.project.getSourceFiles()) {
      if (shouldSkipSource(sf.getFilePath())) continue;

      for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const expr = call.getExpression();
        if (!Node.isPropertyAccessExpression(expr)) continue;

        const method = expr.getName().toLowerCase();
        const args = call.getArguments();
        const filePath = sf.getFilePath();

        // ── Full form: fastify.route({ method, url, schema }) ──────────────────
        if (method === 'route') {
          const cfg = args[0];
          if (cfg && Node.isObjectLiteralExpression(cfg)) {
            const tool = routeConfigToTool(cfg, this.name, filePath);
            if (tool) tools.push(tool);
          }
          continue;
        }

        // ── Shorthand: fastify.get('/x', opts?, handler) ──────────────────────
        if (!METHOD_SET.has(method)) continue;
        const first = args[0];
        if (!first || !Node.isStringLiteral(first)) continue;
        if (!first.getLiteralText().startsWith('/')) continue;
        if (args.length < 2 || Node.isStringLiteral(args[1])) continue;

        const optionsArg = args.find((a, i) => i >= 1 && Node.isObjectLiteralExpression(a));
        const schemaParams = optionsArg
          ? schemaParamsFrom(optionsArg as ObjectLiteralExpression)
          : null;

        tools.push(buildRouteTool({
          method,
          routePath: first.getLiteralText(),
          filePath,
          framework: this.name,
          params:     schemaParams?.params,
          paramTypes: schemaParams?.paramTypes,
        }));
      }
    }

    return tools;
  }
}

function routeConfigToTool(
  cfg: ObjectLiteralExpression,
  framework: string,
  filePath: string,
): ExtractedTool | null {
  const url = stringProp(cfg, 'url');
  const rawMethod = methodProp(cfg);
  if (!url || !rawMethod) return null;

  const schemaProp = getProp(cfg, 'schema');
  const schemaParams =
    schemaProp && Node.isObjectLiteralExpression(schemaProp)
      ? paramsFromSchema(schemaProp)
      : null;

  return buildRouteTool({
    method:     rawMethod,
    routePath:  url,
    filePath,
    framework,
    params:     schemaParams?.params,
    paramTypes: schemaParams?.paramTypes,
  });
}

/** Pull params from a route options object by unwrapping its `schema` property. */
function schemaParamsFrom(
  options: ObjectLiteralExpression,
): { params: string[]; paramTypes: string[] } | null {
  const schema = getProp(options, 'schema');
  if (!schema || !Node.isObjectLiteralExpression(schema)) return null;
  return paramsFromSchema(schema);
}

/** Pull params from a JSON schema object (its body/querystring/params sections). */
function paramsFromSchema(
  schema: ObjectLiteralExpression,
): { params: string[]; paramTypes: string[] } | null {
  const params: string[] = [];
  const paramTypes: string[] = [];
  for (const section of ['params', 'querystring', 'body'] as const) {
    const node = getProp(schema, section);
    if (!node || !Node.isObjectLiteralExpression(node)) continue;
    const props = getProp(node, 'properties');
    if (!props || !Node.isObjectLiteralExpression(props)) continue;
    for (const p of props.getProperties()) {
      if (!Node.isPropertyAssignment(p)) continue;
      const name = p.getName().replace(/^['"]|['"]$/g, '');
      params.push(name);
      paramTypes.push(jsonSchemaType(p.getInitializer()));
    }
  }
  return params.length > 0 ? { params, paramTypes } : null;
}

function jsonSchemaType(node: TsNode | undefined): string {
  if (!node || !Node.isObjectLiteralExpression(node)) return 'string';
  const typeText = stringPropFromLiteral(node, 'type');
  switch (typeText) {
    case 'integer':
    case 'number':  return 'number';
    case 'boolean': return 'boolean';
    case 'array':   return 'unknown[]';
    case 'object':  return 'object';
    default:        return 'string';
  }
}

// ── Object-literal helpers ─────────────────────────────────────────────────────

function getProp(obj: ObjectLiteralExpression, name: string): TsNode | undefined {
  const prop = obj.getProperty(name);
  if (prop && Node.isPropertyAssignment(prop)) return prop.getInitializer();
  return undefined;
}

function stringProp(obj: ObjectLiteralExpression, name: string): string | null {
  const init = getProp(obj, name);
  return init && Node.isStringLiteral(init) ? init.getLiteralText() : null;
}

function stringPropFromLiteral(obj: ObjectLiteralExpression, name: string): string | null {
  return stringProp(obj, name);
}

/** method: 'GET' | ['GET','POST'] → first method string. */
function methodProp(obj: ObjectLiteralExpression): string | null {
  const init = getProp(obj, 'method');
  if (!init) return null;
  if (Node.isStringLiteral(init)) return init.getLiteralText();
  if (Node.isArrayLiteralExpression(init)) {
    const first = init.getElements()[0];
    if (first && Node.isStringLiteral(first)) return first.getLiteralText();
  }
  return null;
}
