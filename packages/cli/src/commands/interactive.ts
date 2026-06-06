// ─────────────────────────────────────────────────────────────────────────────
// commands/interactive.ts  —  guided interactive configuration
// ─────────────────────────────────────────────────────────────────────────────

import path from 'path';
import chalk from 'chalk';
import { input, confirm, select, checkbox } from '@inquirer/prompts';

import { BackendAnalyzer }  from '@mcpify/backend-analyzer';
import { FrontendAnalyzer } from '@mcpify/frontend-analyzer';
import { WorkflowEngine }   from '@mcpify/workflow-engine';
import { PermissionLayer }  from '@mcpify/permissions';
import { MCPGenerator }     from '@mcpify/mcp-generator';
import { applyRuleBasedDescriptions } from '@mcpify/ai-enhancer';
import type { ExtractedTool, ClassifiedTool, Workflow } from '@mcpify/schema-engine';

export async function runInteractive() {
  console.log('\n' + chalk.cyan('  ⚡  ') + chalk.bold.white('MCPify Interactive') + '\n');

  // ── Project path ───────────────────────────────────────────────────────────
  const rootPath = await input({
    message: 'Path to your project:',
    default: '.',
  });

  const absRoot = path.resolve(rootPath);

  // ── Output dir ─────────────────────────────────────────────────────────────
  const outDir = await input({
    message: 'Output directory:',
    default: './.mcpify',
  });

  // ── What to analyze ────────────────────────────────────────────────────────
  const analyzers = await checkbox({
    message: 'What should MCPify analyze?',
    choices: [
      { name: 'Backend TypeScript/JavaScript', value: 'backend',   checked: true },
      { name: 'Frontend React/JSX components', value: 'frontend',  checked: true },
      { name: 'Prisma schema',                 value: 'prisma',    checked: false },
      { name: 'OpenAPI/Swagger spec',          value: 'swagger',   checked: false },
    ],
  });

  let swaggerFile: string | undefined;
  if (analyzers.includes('swagger')) {
    swaggerFile = await input({ message: 'Path to OpenAPI/Swagger file:' });
  }

  let prismaFile: string | undefined;
  if (analyzers.includes('prisma')) {
    prismaFile = await input({
      message: 'Path to Prisma schema:',
      default: './prisma/schema.prisma',
    });
  }

  // ── AI enhancement ─────────────────────────────────────────────────────────
  const aiEnhance = await confirm({
    message: 'Use Claude AI to improve tool descriptions? (requires ANTHROPIC_API_KEY)',
    default: !!process.env.ANTHROPIC_API_KEY,
  });

  // ── Watch mode ─────────────────────────────────────────────────────────────
  const watchMode = await confirm({
    message: 'Enable watch mode (auto-regenerate on file changes)?',
    default: false,
  });

  console.log('\n' + chalk.dim('  Running analysis…\n'));

  // ── Collect tools ──────────────────────────────────────────────────────────
  const allTools: ExtractedTool[] = [];

  if (analyzers.includes('backend')) {
    const tools = await new BackendAnalyzer(absRoot).extract().catch(() => []);
    allTools.push(...tools);
    console.log(chalk.green(`  ✓`) + chalk.dim(` ${tools.length} backend actions`));
  }

  if (analyzers.includes('frontend')) {
    const tools = await new FrontendAnalyzer(absRoot).extract().catch(() => []);
    allTools.push(...tools);
    console.log(chalk.green(`  ✓`) + chalk.dim(` ${tools.length} UI actions`));
  }

  if (swaggerFile) {
    const { SwaggerConverter } = await import('@mcpify/backend-analyzer');
    const tools = await SwaggerConverter.fromFile(path.resolve(swaggerFile)).catch(() => []);
    allTools.push(...tools);
    console.log(chalk.green(`  ✓`) + chalk.dim(` ${tools.length} API endpoints`));
  }

  if (prismaFile) {
    const { PrismaAnalyzer } = await import('@mcpify/backend-analyzer');
    const tools = await new PrismaAnalyzer(path.resolve(prismaFile)).extract().catch(() => []);
    allTools.push(...tools);
    console.log(chalk.green(`  ✓`) + chalk.dim(` ${tools.length} database operations`));
  }

  // ── Show discovered tools and let user deselect ───────────────────────────
  if (allTools.length === 0) {
    console.log(chalk.yellow('\n  No tools found. Check your project path.\n'));
    return;
  }

  const selectedNames = await checkbox({
    message: `Select tools to expose (${allTools.length} found):`,
    choices: allTools.map(t => ({
      name:    `${t.name}(${t.params.join(', ')}) [${t.source}]`,
      value:   t.name,
      checked: true,
    })),
    pageSize: 20,
  });

  const selectedTools = allTools.filter(t => selectedNames.includes(t.name));

  // ── Detect workflows ───────────────────────────────────────────────────────
  const workflows = await new WorkflowEngine(selectedTools).extract();
  console.log(chalk.green(`\n  ✓`) + chalk.dim(` ${workflows.length} workflows detected`));

  // ── Classify permissions ───────────────────────────────────────────────────
  const permLayer  = new PermissionLayer();
  const classified = permLayer.classify([...selectedTools, ...workflows]);
  const classifiedTools     = classified.filter(t => t.source !== 'workflow') as ClassifiedTool[];
  const classifiedWorkflows = classified.filter(t => t.source === 'workflow') as Workflow[];

  // ── Optionally override permissions ───────────────────────────────────────
  const overridePerms = await confirm({
    message: 'Review and override any permission levels?',
    default: false,
  });

  let finalTools = applyRuleBasedDescriptions(classifiedTools);

  if (overridePerms) {
    for (const tool of finalTools) {
      const current = tool.permission;
      const choice  = await select({
        message: `${tool.name} — current: ${current}`,
        choices: [
          { name: `Keep ${current}`,          value: current },
          { name: 'SAFE',                      value: 'SAFE' },
          { name: 'REQUIRES_CONFIRMATION',     value: 'REQUIRES_CONFIRMATION' },
          { name: 'BLOCKED',                   value: 'BLOCKED' },
        ] as any,
        default: current,
      });
      (tool as any).permission = choice;
    }
  }

  // ── AI enhancement ─────────────────────────────────────────────────────────
  if (aiEnhance && process.env.ANTHROPIC_API_KEY) {
    console.log(chalk.dim('\n  Enhancing with Claude AI…'));
    const { AIEnhancer } = await import('@mcpify/ai-enhancer');
    finalTools = await new AIEnhancer().enhance(finalTools).catch(() => finalTools);
    console.log(chalk.green('  ✓') + chalk.dim(' AI enhancement complete'));
  }

  // ── Generate ───────────────────────────────────────────────────────────────
  console.log(chalk.dim('\n  Generating MCP server…'));
  const generator = new MCPGenerator(path.resolve(outDir));
  const output    = await generator.generate(finalTools, classifiedWorkflows);

  console.log('\n' + chalk.green.bold('  ✓ Done!\n'));
  for (const f of output.files) {
    console.log(`    ${chalk.gray('→')} ${chalk.white(f.replace(path.resolve(outDir), '').replace(/^\//, ''))}`);
  }

  // ── Watch ──────────────────────────────────────────────────────────────────
  if (watchMode) {
    const { startWatcher } = await import('../watcher.js');
    await startWatcher(absRoot, path.resolve(outDir), {
      aiEnhance: aiEnhance && !!process.env.ANTHROPIC_API_KEY,
    });
  }

  console.log('');
}
