// ─────────────────────────────────────────────────────────────────────────────
// commands/audit.ts  —  static audit without generating files
// ─────────────────────────────────────────────────────────────────────────────

import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

import { BackendAnalyzer }        from '@mcpify/backend-analyzer';
import { FrontendAnalyzer }       from '@mcpify/frontend-analyzer';
import { WorkflowEngine }         from '@mcpify/workflow-engine';
import { PermissionLayer }        from '@mcpify/permissions';
import { StaticAuditor, formatAuditReport } from '@mcpify/security';
import { applyRuleBasedDescriptions }       from '@mcpify/ai-enhancer';
import type { ExtractedTool }     from '@mcpify/schema-engine';

export async function runAudit(rootPath: string, _opts: { output?: string }) {
  const absRoot = path.resolve(rootPath);

  console.log('\n' + chalk.cyan('  🔍  ') + chalk.bold.white('MCPify Audit') + '\n');

  const allTools: ExtractedTool[] = [];

  const s1 = ora({ text: 'Analyzing backend…',  prefixText: '  ' }).start();
  try {
    const tools = await new BackendAnalyzer(absRoot).extract();
    allTools.push(...tools);
    s1.succeed(chalk.dim(`${tools.length} backend actions`));
  } catch (e: any) { s1.warn(chalk.yellow(e.message)); }

  const s2 = ora({ text: 'Analyzing frontend…', prefixText: '  ' }).start();
  try {
    const tools = await new FrontendAnalyzer(absRoot).extract();
    allTools.push(...tools);
    s2.succeed(chalk.dim(`${tools.length} UI actions`));
  } catch (e: any) { s2.warn(chalk.yellow(e.message)); }

  const s3 = ora({ text: 'Detecting workflows…', prefixText: '  ' }).start();
  const workflows = await new WorkflowEngine(allTools).extract();
  s3.succeed(chalk.dim(`${workflows.length} workflows`));

  const classified = new PermissionLayer().classify([...allTools, ...workflows]);
  const withDesc   = applyRuleBasedDescriptions(classified as any);

  // Run static audit
  const auditor = new StaticAuditor();
  const report  = auditor.audit(withDesc as any);

  console.log(formatAuditReport(report));

  // Print tool table
  console.log(chalk.bold('  Tool Overview\n'));
  console.log(
    '  ' +
    chalk.dim('NAME'.padEnd(40)) +
    chalk.dim('SOURCE'.padEnd(12)) +
    chalk.dim('PERMISSION')
  );
  console.log('  ' + '─'.repeat(70));

  for (const tool of withDesc) {
    const color =
      tool.permission === 'SAFE'                  ? chalk.green :
      tool.permission === 'REQUIRES_CONFIRMATION' ? chalk.yellow :
      tool.permission === 'BLOCKED'               ? chalk.red    : chalk.gray;

    console.log(
      '  ' +
      chalk.white(tool.name.padEnd(40)) +
      chalk.dim(tool.source.padEnd(12)) +
      color(tool.permission)
    );
  }

  console.log('');
  process.exit(report.passed ? 0 : 1);
}
