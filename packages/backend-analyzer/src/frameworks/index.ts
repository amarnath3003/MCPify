// ─────────────────────────────────────────────────────────────────────────────
// Framework analyzer registry + runner
// ─────────────────────────────────────────────────────────────────────────────

import type { ExtractedTool } from '@mcpify/schema-engine';
import type { FrameworkAnalyzer, FrameworkContext } from './types.js';
import { ExpressAnalyzer } from './express.js';
import { FastifyAnalyzer } from './fastify.js';
import { NestAnalyzer } from './nest.js';
import { NextAnalyzer } from './next.js';

export * from './types.js';
export * from './shared.js';

/** All registered framework analyzers, tried in order. */
const ANALYZERS: FrameworkAnalyzer[] = [
  new ExpressAnalyzer(),
  new FastifyAnalyzer(),
  new NestAnalyzer(),
  new NextAnalyzer(),
];

export interface FrameworkRunResult {
  tools: ExtractedTool[];
  /** Names of frameworks that were detected and produced tools. */
  frameworks: string[];
}

/**
 * Run every analyzer whose framework is detected. Each analyzer is isolated —
 * one throwing does not abort the others.
 */
export function runFrameworkAnalyzers(ctx: FrameworkContext): FrameworkRunResult {
  const tools: ExtractedTool[] = [];
  const frameworks: string[] = [];

  for (const analyzer of ANALYZERS) {
    try {
      if (!analyzer.detect(ctx)) continue;
      const found = analyzer.extract(ctx);
      if (found.length > 0) {
        tools.push(...found);
        frameworks.push(analyzer.name);
      }
    } catch {
      // Isolated failure — skip this framework, keep the rest.
    }
  }

  return { tools, frameworks };
}
