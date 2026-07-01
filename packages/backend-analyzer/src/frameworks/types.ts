// ─────────────────────────────────────────────────────────────────────────────
// Framework analyzer plugin contract
//
// A FrameworkAnalyzer inspects an already-loaded ts-morph Project and surfaces
// route-bound tools (HTTP endpoints, handlers) that the generic exported-function
// scan in BackendAnalyzer cannot see — e.g. an inline `app.get('/x', () => …)`
// handler that is never exported.
// ─────────────────────────────────────────────────────────────────────────────

import type { Project } from 'ts-morph';
import type { ExtractedTool } from '@mcpify/schema-engine';

export interface FrameworkContext {
  /** Absolute root path of the analyzed project. */
  rootPath: string;
  /** Merged dependencies + devDependencies from the nearest package.json. */
  deps: Record<string, string>;
  /** Shared ts-morph project — source files are already added. */
  project: Project;
}

export interface FrameworkAnalyzer {
  /** Stable identifier, also stamped onto emitted tools as `framework`. */
  readonly name: string;
  /** Cheap presence check based on deps and/or quick source signals. */
  detect(ctx: FrameworkContext): boolean;
  /** Extract route-bound tools. Called only when detect() returns true. */
  extract(ctx: FrameworkContext): ExtractedTool[];
}
