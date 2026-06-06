// ─────────────────────────────────────────────────────────────────────────────
// commands/simulate.ts  —  AI security simulation
// ─────────────────────────────────────────────────────────────────────────────

import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

import { BackendAnalyzer }  from '@mcpify/backend-analyzer';
import { FrontendAnalyzer } from '@mcpify/frontend-analyzer';
import { WorkflowEngine }   from '@mcpify/workflow-engine';
import { PermissionLayer }  from '@mcpify/permissions';
import { applyRuleBasedDescriptions } from '@mcpify/ai-enhancer';
import {
  SimulationEngine,
  formatSimulationReport,
  StaticAuditor,
  formatAuditReport,
} from '@mcpify/security';
import type { ExtractedTool, ClassifiedTool } from '@mcpify/schema-engine';

export async function runSimulate(rootPath: string, _opts: { output?: string }) {
  const absRoot = path.resolve(rootPath);

  console.log('\n' + chalk.cyan('  🛡   ') + chalk.bold.white('MCPify Security Simulation') + '\n');

  // ── Collect tools ──────────────────────────────────────────────────────────
  const allTools: ExtractedTool[] = [];

  const s1 = ora({ text: 'Loading tools…', prefixText: '  ' }).start();
  try {
    const [backend, frontend] = await Promise.all([
      new BackendAnalyzer(absRoot).extract().catch(() => []),
      new FrontendAnalyzer(absRoot).extract().catch(() => []),
    ]);
    allTools.push(...backend, ...frontend);
    s1.succeed(chalk.dim(`${allTools.length} tools loaded`));
  } catch (e: any) {
    s1.fail(chalk.red(`Failed to load tools: ${e.message}`));
    return;
  }

  const workflows = await new WorkflowEngine(allTools).extract();
  const classified = new PermissionLayer().classify([...allTools, ...workflows]);
  const tools = applyRuleBasedDescriptions(classified as any) as ClassifiedTool[];

  // ── Static audit first (no API key needed) ─────────────────────────────────
  console.log(chalk.bold('\n  Running static audit…'));
  const auditor = new StaticAuditor();
  const audit   = auditor.audit(tools);
  console.log(formatAuditReport(audit));

  // ── AI simulation (needs API key) ─────────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(chalk.yellow('  ⚠️  ANTHROPIC_API_KEY not set — skipping AI simulation.\n'));
    process.exit(audit.passed ? 0 : 1);
    return;
  }

  console.log(chalk.bold('  Running AI simulation battery…'));
  console.log(chalk.dim('  This sends test prompts to Claude to verify security boundaries.\n'));

  const engine  = new SimulationEngine();
  const spinner = ora({ text: 'Running simulations (this takes ~30s)…', prefixText: '  ' }).start();
  
  try {
    const results = await engine.run(tools);
    spinner.succeed('Simulation complete');
    console.log(formatSimulationReport(results));

    const failed = results.filter(r => r.result === 'FAIL').length;
    process.exit(failed === 0 && audit.passed ? 0 : 1);
  } catch (err: any) {
    spinner.fail(chalk.red(`Simulation failed: ${err.message}`));
    process.exit(1);
  }
}
