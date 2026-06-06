// ─────────────────────────────────────────────────────────────────────────────
// commands/analyze.ts  —  full pipeline orchestration
// ─────────────────────────────────────────────────────────────────────────────

import path from 'path';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';

import { BackendAnalyzer, PrismaAnalyzer, SwaggerConverter } from '@mcpify/backend-analyzer';
import { FrontendAnalyzer }                                  from '@mcpify/frontend-analyzer';
import { WorkflowEngine }                                    from '@mcpify/workflow-engine';
import { PermissionLayer, permissionBadge }                  from '@mcpify/permissions';
import { MCPGenerator }                                      from '@mcpify/mcp-generator';
import { AIEnhancer, applyRuleBasedDescriptions }            from '@mcpify/ai-enhancer';
import type { ExtractedTool, ClassifiedTool, Workflow }      from '@mcpify/schema-engine';

export interface AnalyzeOptions {
  aiEnhance?:  boolean;
  output:      string;
  watch?:      boolean;
  frontend?:   boolean;   // default true; --no-frontend sets false
  workflows?:  boolean;   // default true; --no-workflows sets false
  swagger?:    string;
  prisma?:     string;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function runAnalysis(rootPath: string, opts: AnalyzeOptions) {
  const absRoot = path.resolve(rootPath);
  const outDir  = path.resolve(opts.output);

  printBanner();

  const allTools: ExtractedTool[] = [];

  // ── Step 1: Backend analysis ──────────────────────────────────────────────
  const backendSpinner = step('Analyzing backend TypeScript/JavaScript…');
  try {
    const analyzer   = new BackendAnalyzer(absRoot);
    const backendTools = await analyzer.extract();
    allTools.push(...backendTools);
    done(backendSpinner, `${backendTools.length} backend actions found`);
  } catch (err: any) {
    warn(backendSpinner, `Backend analysis failed: ${err.message}`);
  }

  // ── Step 1b: Swagger / OpenAPI (optional) ─────────────────────────────────
  if (opts.swagger) {
    const swaggerSpinner = step('Converting OpenAPI spec…');
    try {
      const swaggerTools = await SwaggerConverter.fromFile(path.resolve(opts.swagger));
      allTools.push(...swaggerTools);
      done(swaggerSpinner, `${swaggerTools.length} API endpoints converted`);
    } catch (err: any) {
      warn(swaggerSpinner, `Swagger conversion failed: ${err.message}`);
    }
  }

  // ── Step 1c: Prisma schema (optional) ────────────────────────────────────
  if (opts.prisma) {
    const prismaSpinner = step('Analyzing Prisma schema…');
    try {
      const prismaAnalyzer = new PrismaAnalyzer(path.resolve(opts.prisma));
      const prismaTools    = await prismaAnalyzer.extract();
      allTools.push(...prismaTools);
      done(prismaSpinner, `${prismaTools.length} database operations generated`);
    } catch (err: any) {
      warn(prismaSpinner, `Prisma analysis failed: ${err.message}`);
    }
  }

  // ── Step 2: Frontend analysis (optional) ─────────────────────────────────
  let frontendCount = 0;
  if (opts.frontend !== false) {
    const frontendSpinner = step('Analyzing frontend components…');
    try {
      const fAnalyzer     = new FrontendAnalyzer(absRoot);
      const frontendTools = await fAnalyzer.extract();
      allTools.push(...frontendTools);
      frontendCount = frontendTools.length;
      done(frontendSpinner, `${frontendTools.length} UI actions found`);
    } catch (err: any) {
      warn(frontendSpinner, `Frontend analysis failed: ${err.message}`);
    }
  }

  // ── Step 3: Workflow detection (optional) ─────────────────────────────────
  let detectedWorkflows: Workflow[] = [];
  if (opts.workflows !== false) {
    const workflowSpinner = step('Detecting workflows…');
    try {
      const engine = new WorkflowEngine(allTools);
      detectedWorkflows = await engine.extract();
      done(workflowSpinner, `${detectedWorkflows.length} workflows detected`);
    } catch (err: any) {
      warn(workflowSpinner, `Workflow detection failed: ${err.message}`);
    }
  }

  // ── Step 4: Permission classification ────────────────────────────────────
  const permSpinner = step('Classifying permissions…');
  const permLayer   = new PermissionLayer();
  const classified  = permLayer.classify([...allTools, ...detectedWorkflows]);
  const classifiedTools     = classified.filter(t => t.source !== 'workflow') as ClassifiedTool[];
  const classifiedWorkflows = classified.filter(t => t.source === 'workflow') as Workflow[];
  done(permSpinner, 'Permissions classified');

  // ── Step 5: AI or rule-based description enhancement ────────────────────
  let finalTools = classifiedTools;
  if (opts.aiEnhance && process.env.ANTHROPIC_API_KEY) {
    const aiSpinner = step('Enhancing with Claude AI…');
    try {
      const enhancer = new AIEnhancer();
      finalTools = await enhancer.enhance(classifiedTools);
      done(aiSpinner, 'AI metadata enhancement complete');
    } catch (err: any) {
      warn(aiSpinner, `AI enhancement failed: ${err.message} — using rule-based fallback`);
      finalTools = applyRuleBasedDescriptions(classifiedTools);
    }
  } else {
    finalTools = applyRuleBasedDescriptions(classifiedTools);
  }

  // ── Step 6: MCP generation ────────────────────────────────────────────────
  const genSpinner = step('Generating MCP server…');
  const generator  = new MCPGenerator(outDir);
  const output     = await generator.generate(finalTools, classifiedWorkflows);
  done(genSpinner, 'MCP server generated');

  // ── Summary ───────────────────────────────────────────────────────────────
  printSummary(finalTools, classifiedWorkflows, output.files, outDir);

  // ── Watch mode ────────────────────────────────────────────────────────────
  if (opts.watch) {
    const { startWatcher } = await import('../../src/watcher.js');
    await startWatcher(absRoot, outDir, opts);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function printBanner() {
  console.log('\n' + chalk.cyan('  ⚡  ') + chalk.bold.white('MCPify') + chalk.dim(' — AI Enablement Compiler') + '\n');
}

function step(text: string): Ora {
  return ora({ text, prefixText: '  ' }).start();
}

function done(spinner: Ora, text: string) {
  spinner.succeed(chalk.dim(text));
}

function warn(spinner: Ora, text: string) {
  spinner.warn(chalk.yellow(text));
}

function printSummary(
  tools:     ClassifiedTool[],
  workflows: Workflow[],
  files:     string[],
  outDir:    string
) {
  const safe    = tools.filter(t => t.permission === 'SAFE');
  const confirm = tools.filter(t => t.permission === 'REQUIRES_CONFIRMATION');
  const blocked = tools.filter(t => t.permission === 'BLOCKED');

  console.log('\n' + chalk.green.bold('  ✓ MCPify complete!\n'));

  console.log(chalk.dim('  Generated files:'));
  for (const f of files) {
    const rel = f.replace(outDir, '').replace(/^\//, '');
    console.log(`    ${chalk.gray('→')} ${chalk.white(rel)}`);
  }

  console.log('\n' + chalk.white.bold('  Generated tools:'));
  for (const t of [...tools, ...workflows]) {
    const badge = permissionBadge(t.permission);
    const color =
      t.permission === 'SAFE'                  ? chalk.green :
      t.permission === 'REQUIRES_CONFIRMATION' ? chalk.yellow :
      t.permission === 'BLOCKED'               ? chalk.red    : chalk.gray;

    const sig = t.params.length > 0
      ? `${t.name}(${t.params.join(', ')})`
      : `${t.name}()`;

    console.log(`    ${color(badge)}  ${chalk.bold(sig)}`);
  }

  console.log([
    '',
    `  ${chalk.green('✅')} ${safe.length} safe    ` +
    `${chalk.yellow('⚠️ ')} ${confirm.length} confirm    ` +
    `${chalk.red('🚫')} ${blocked.length} blocked    ` +
    `${chalk.cyan('🔄')} ${workflows.length} workflows`,
    '',
    `  ${chalk.dim('Output:')} ${chalk.white(outDir)}`,
    '',
    `  ${chalk.dim('Next:')} ${chalk.cyan('cd ' + outDir + ' && npm install && npm run build')}`,
    `  ${chalk.dim('Then:')} add the server to Claude Desktop (see AGENTS.md)`,
    '',
  ].join('\n'));
}
