import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  BackendAnalyzer,
  DrizzleAnalyzer,
  MongooseAnalyzer,
  PrismaAnalyzer,
  SwaggerConverter,
} from '@mcpify/backend-analyzer';
import { FrontendAnalyzer } from '@mcpify/frontend-analyzer';
import { MCPGenerator } from '@mcpify/mcp-generator';
import { PermissionLayer } from '@mcpify/permissions';
import type { ClassifiedTool, ExtractedTool, Workflow } from '@mcpify/schema-engine';
import { applyRuleBasedDescriptions, AIEnhancer } from '@mcpify/ai-enhancer';
import { WorkflowEngine } from '@mcpify/workflow-engine';

const CACHE_VERSION = 1;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const FRONTEND_EXTENSIONS = new Set(['.tsx', '.jsx', '.vue', '.svelte', '.html']);
const CACHE_DIR = 'cache';
const CACHE_FILE = 'incremental-cache.json';

export interface IncrementalAnalyzeOptions {
  aiEnhance?: boolean;
  output: string;
  frontend?: boolean;
  workflows?: boolean;
  swagger?: string;
  prisma?: string;
  drizzle?: string;
  mongoose?: string;
}

export type IncrementalUpdateEvent = 'add' | 'change' | 'unlink';
export type IncrementalUpdateMode = 'full' | 'incremental' | 'skipped';

export interface IncrementalUpdateResult {
  mode: IncrementalUpdateMode;
  changedFile?: string;
  reasons: string[];
  changedTools: number;
  totalTools: number;
  workflows: number;
  generatedFiles: string[];
}

interface IncrementalCache {
  version: number;
  rootPath: string;
  optionsHash: string;
  toolsByFile: Record<string, ExtractedTool[]>;
  updatedAt: string;
}

export class IncrementalUpdater {
  private cache: IncrementalCache | null = null;
  private readonly absRoot: string;
  private readonly outDir: string;
  private readonly cachePath: string;

  constructor(
    rootPath: string,
    outDir: string,
    private readonly opts: IncrementalAnalyzeOptions
  ) {
    this.absRoot = path.resolve(rootPath);
    this.outDir = path.resolve(outDir);
    this.cachePath = path.join(this.outDir, CACHE_DIR, CACHE_FILE);
  }

  async initialize(): Promise<IncrementalUpdateResult> {
    const loaded = await this.loadCache();
    if (loaded) {
      this.cache = loaded;
      return {
        mode: 'skipped',
        reasons: ['cache-loaded'],
        changedTools: 0,
        totalTools: this.allTools().length,
        workflows: 0,
        generatedFiles: [],
      };
    }

    return this.fullRebuild(['cache-missing']);
  }

  async update(
    changedFile: string,
    event: IncrementalUpdateEvent = 'change'
  ): Promise<IncrementalUpdateResult> {
    if (!this.cache) {
      await this.initialize();
    }

    const absFile = path.resolve(this.absRoot, changedFile);
    const relFile = path.relative(this.absRoot, absFile);
    const reasons = classifyChange(absFile, this.absRoot, this.opts);

    if (reasons.includes('ignored')) {
      return {
        mode: 'skipped',
        changedFile: relFile,
        reasons,
        changedTools: 0,
        totalTools: this.allTools().length,
        workflows: 0,
        generatedFiles: [],
      };
    }

    if (reasons.includes('full')) {
      return this.fullRebuild(reasons, relFile);
    }

    const cache = this.ensureCache();
    delete cache.toolsByFile[absFile];

    let changedTools: ExtractedTool[] = [];
    if (event !== 'unlink') {
      changedTools = await this.extractChangedFile(absFile, reasons);
      if (changedTools.length > 0) {
        cache.toolsByFile[absFile] = changedTools;
      }
    }

    const generated = await this.regenerate();
    await this.saveCache();

    return {
      mode: 'incremental',
      changedFile: relFile,
      reasons,
      changedTools: changedTools.length,
      totalTools: this.allTools().length,
      workflows: generated.workflows,
      generatedFiles: generated.files,
    };
  }

  private async fullRebuild(
    reasons: string[],
    changedFile?: string
  ): Promise<IncrementalUpdateResult> {
    const tools = await this.extractAll();
    this.cache = {
      version: CACHE_VERSION,
      rootPath: this.absRoot,
      optionsHash: this.optionsHash(),
      toolsByFile: groupByFile(tools),
      updatedAt: new Date().toISOString(),
    };

    const generated = await this.regenerate();
    await this.saveCache();

    return {
      mode: 'full',
      changedFile,
      reasons,
      changedTools: tools.length,
      totalTools: this.allTools().length,
      workflows: generated.workflows,
      generatedFiles: generated.files,
    };
  }

  private async extractAll(): Promise<ExtractedTool[]> {
    const allTools: ExtractedTool[] = [];

    allTools.push(...await new BackendAnalyzer(this.absRoot).extract());

    if (this.opts.swagger) {
      allTools.push(...await SwaggerConverter.fromFile(path.resolve(this.opts.swagger)));
    }

    if (this.opts.prisma) {
      allTools.push(...await new PrismaAnalyzer(path.resolve(this.opts.prisma)).extract());
    }

    if (this.opts.drizzle) {
      allTools.push(...await new DrizzleAnalyzer(path.resolve(this.opts.drizzle)).extract());
    }

    if (this.opts.mongoose) {
      allTools.push(...await new MongooseAnalyzer(path.resolve(this.opts.mongoose)).extract());
    }

    if (this.opts.frontend !== false) {
      allTools.push(...await new FrontendAnalyzer(this.absRoot).extract());
    }

    return dedupeTools(allTools);
  }

  private async extractChangedFile(
    absFile: string,
    reasons: string[]
  ): Promise<ExtractedTool[]> {
    const tools: ExtractedTool[] = [];
    const dir = path.dirname(absFile);

    if (reasons.includes('swagger')) {
      tools.push(...await SwaggerConverter.fromFile(absFile));
    }

    if (reasons.includes('prisma')) {
      tools.push(...await new PrismaAnalyzer(absFile).extract());
    }

    if (reasons.includes('drizzle')) {
      tools.push(...await new DrizzleAnalyzer(absFile).extract());
    }

    if (reasons.includes('mongoose')) {
      tools.push(...await new MongooseAnalyzer(absFile).extract());
    }

    if (reasons.includes('backend')) {
      const backendTools = await new BackendAnalyzer(dir).extract();
      tools.push(...backendTools.filter(tool => samePath(tool.filePath, absFile)));
    }

    if (reasons.includes('frontend') && this.opts.frontend !== false) {
      const frontendTools = await new FrontendAnalyzer(dir).extract();
      tools.push(...frontendTools.filter(tool => samePath(tool.filePath, absFile)));
    }

    return dedupeTools(tools);
  }

  private async regenerate(): Promise<{ files: string[]; workflows: number }> {
    const tools = this.allTools();
    const workflows = this.opts.workflows === false
      ? []
      : await new WorkflowEngine(tools).extract();

    const classified = new PermissionLayer().classify([...tools, ...workflows]);
    const classifiedTools = classified.filter(tool => tool.source !== 'workflow') as ClassifiedTool[];
    const classifiedWorkflows = classified.filter(tool => tool.source === 'workflow') as Workflow[];
    const finalTools = await this.enhanceTools(classifiedTools);
    const output = await new MCPGenerator(this.outDir).generate(finalTools, classifiedWorkflows);

    return {
      files: output.files,
      workflows: classifiedWorkflows.length,
    };
  }

  private async enhanceTools(tools: ClassifiedTool[]): Promise<ClassifiedTool[]> {
    if (this.opts.aiEnhance && process.env.ANTHROPIC_API_KEY) {
      try {
        return await new AIEnhancer().enhance(tools);
      } catch {
        return applyRuleBasedDescriptions(tools);
      }
    }

    return applyRuleBasedDescriptions(tools);
  }

  private allTools(): ExtractedTool[] {
    const cache = this.cache;
    if (!cache) return [];
    return dedupeTools(Object.values(cache.toolsByFile).flat());
  }

  private ensureCache(): IncrementalCache {
    if (!this.cache) {
      throw new Error('Incremental cache is not initialized');
    }
    return this.cache;
  }

  private async loadCache(): Promise<IncrementalCache | null> {
    try {
      const raw = await fs.readFile(this.cachePath, 'utf8');
      const parsed = JSON.parse(raw) as IncrementalCache;
      if (
        parsed.version !== CACHE_VERSION ||
        parsed.rootPath !== this.absRoot ||
        parsed.optionsHash !== this.optionsHash()
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private async saveCache(): Promise<void> {
    const cache = this.ensureCache();
    cache.updatedAt = new Date().toISOString();
    await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
    await fs.writeFile(this.cachePath, JSON.stringify(cache, null, 2), 'utf8');
  }

  private optionsHash(): string {
    const hashInput = {
      frontend: this.opts.frontend !== false,
      workflows: this.opts.workflows !== false,
      swagger: this.opts.swagger ? path.resolve(this.opts.swagger) : '',
      prisma: this.opts.prisma ? path.resolve(this.opts.prisma) : '',
      drizzle: this.opts.drizzle ? path.resolve(this.opts.drizzle) : '',
      mongoose: this.opts.mongoose ? path.resolve(this.opts.mongoose) : '',
    };
    return crypto.createHash('sha1').update(JSON.stringify(hashInput)).digest('hex');
  }
}

function classifyChange(
  absFile: string,
  absRoot: string,
  opts: IncrementalAnalyzeOptions
): string[] {
  const rel = path.relative(absRoot, absFile).replace(/\\/g, '/');
  const ext = path.extname(absFile).toLowerCase();
  const reasons: string[] = [];

  if (
    rel.startsWith('node_modules/') ||
    rel.startsWith('dist/') ||
    rel.startsWith('.git/') ||
    rel.startsWith('.mcpify/') ||
    /\.(test|spec)\.(ts|tsx|js|jsx|vue|svelte)$/.test(rel) ||
    rel.endsWith('.d.ts')
  ) {
    return ['ignored'];
  }

  if (
    rel === 'package.json' ||
    rel.endsWith('tsconfig.json') ||
    /(^|\/)mcpify\.config\.(ts|js)$/.test(rel)
  ) {
    return ['full'];
  }

  if (opts.swagger && samePath(absFile, path.resolve(opts.swagger))) {
    reasons.push('swagger');
  }

  if (opts.prisma && samePath(absFile, path.resolve(opts.prisma))) {
    reasons.push('prisma');
  } else if (rel.endsWith('schema.prisma')) {
    reasons.push('prisma');
  }

  if (opts.drizzle && isInside(absFile, path.resolve(opts.drizzle))) {
    reasons.push('drizzle');
  }

  if (opts.mongoose && isInside(absFile, path.resolve(opts.mongoose))) {
    reasons.push('mongoose');
  }

  if (SOURCE_EXTENSIONS.has(ext)) {
    reasons.push('backend');
  }

  if (FRONTEND_EXTENSIONS.has(ext) || /\.component\.[jt]s$/.test(rel)) {
    reasons.push('frontend');
  }

  return [...new Set(reasons.length > 0 ? reasons : ['full'])];
}

function groupByFile(tools: ExtractedTool[]): Record<string, ExtractedTool[]> {
  const grouped: Record<string, ExtractedTool[]> = {};
  for (const tool of tools) {
    const key = path.resolve(tool.filePath);
    grouped[key] ??= [];
    grouped[key].push(tool);
  }
  return grouped;
}

function dedupeTools(tools: ExtractedTool[]): ExtractedTool[] {
  const seen = new Set<string>();
  return tools.filter(tool => {
    if (seen.has(tool.name)) return false;
    seen.add(tool.name);
    return true;
  });
}

function isInside(filePath: string, targetPath: string): boolean {
  const resolvedFile = path.resolve(filePath);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedFile === resolvedTarget ||
    resolvedFile.startsWith(`${resolvedTarget}${path.sep}`);
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}
