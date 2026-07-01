// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers for framework route analyzers
// ─────────────────────────────────────────────────────────────────────────────

import type { ExtractedTool } from '@mcpify/schema-engine';

/** HTTP verbs recognized across Express / Fastify / Nest / Next. */
export const HTTP_METHODS = [
  'get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all',
] as const;

/** Methods that carry a request body worth exposing as a `body` param. */
const BODY_METHODS = new Set(['post', 'put', 'patch']);

/** Directories and file kinds framework analyzers should never scan. */
export function shouldSkipSource(filePath: string): boolean {
  const p = filePath.replace(/\\/g, '/');
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
    /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(p) ||
    p.endsWith('.d.ts')
  );
}

/** camelCase a snake/kebab/space separated identifier. */
export function toCamel(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, c => c.toLowerCase());
}

/** Join a router base path with a sub path, collapsing duplicate slashes. */
export function joinRoutePath(base: string, sub: string): string {
  const combined = `/${base ?? ''}/${sub ?? ''}`.replace(/\/{2,}/g, '/');
  return combined.length > 1 ? combined.replace(/\/$/, '') : combined;
}

/** Extract path parameter names — both `:id` (express) and `{id}` (openapi) styles. */
export function pathParams(routePath: string): string[] {
  const params: string[] = [];
  const colon = /:([A-Za-z0-9_]+)/g;
  const brace = /\{([A-Za-z0-9_]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = colon.exec(routePath)) !== null) params.push(m[1]);
  while ((m = brace.exec(routePath)) !== null) params.push(m[1]);
  return params;
}

/** Derive a camelCase tool name from an HTTP method + route path. */
export function routeToolName(method: string, routePath: string): string {
  const cleaned = routePath
    .replace(/[:{}]/g, '')
    .replace(/\//g, '_')
    .replace(/^_+|_+$/g, '');
  const verb = method === 'all' ? 'handle' : method;
  return toCamel(`${verb}_${cleaned || 'root'}`);
}

export interface RouteToolInput {
  method: string;
  routePath: string;
  filePath: string;
  framework: string;
  /** Explicit params (overrides the path-param + body heuristic when provided). */
  params?: string[];
  paramTypes?: string[];
  description?: string;
  isAsync?: boolean;
}

/**
 * Build a route-bound ExtractedTool. When explicit params are not supplied the
 * params are inferred from the path (`:id` → `id`) plus a generic `body` for
 * body-carrying methods — mirroring how SwaggerConverter shapes API tools.
 */
export function buildRouteTool(input: RouteToolInput): ExtractedTool {
  const method = input.method.toLowerCase();

  let params: string[];
  let paramTypes: string[];
  if (input.params) {
    params = input.params;
    paramTypes = input.paramTypes ?? params.map(() => 'string');
  } else {
    params = pathParams(input.routePath);
    paramTypes = params.map(() => 'string');
    if (BODY_METHODS.has(method)) {
      params.push('body');
      paramTypes.push('object');
    }
  }

  return {
    name:        routeToolName(method, input.routePath),
    source:      'backend',
    description: input.description ?? '',
    params,
    paramTypes,
    returnType:  'unknown',
    filePath:    input.filePath,
    permission:  'UNKNOWN',
    isAsync:     input.isAsync ?? true,
    httpMethod:  method.toUpperCase(),
    httpPath:    input.routePath,
    framework:   input.framework,
    reachable:   true,
  };
}
