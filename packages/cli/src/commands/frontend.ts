// commands/frontend.ts
import path from 'path';
import chalk from 'chalk';
import { FrontendAnalyzer } from '@mcpify/frontend-analyzer';

export async function runFrontend(rootPath: string, opts: { json?: boolean }) {
  const absRoot = path.resolve(rootPath);
  console.log('\n' + chalk.cyan('  🖥   ') + chalk.bold.white('MCPify Frontend Extraction') + '\n');

  const analyzer = new FrontendAnalyzer(absRoot);
  const actions  = await analyzer.extract();

  if (opts.json) {
    console.log(JSON.stringify(actions, null, 2));
    return;
  }

  console.log(chalk.dim(`  Found ${actions.length} UI actions:\n`));
  for (const a of actions) {
    console.log(
      `  ${chalk.green('✓')} ${chalk.bold(a.name)}` +
      (a.originalHandler ? chalk.dim(` ← ${a.originalHandler}`) : '') +
      (a.description ? chalk.dim(`\n    ${a.description}`) : '')
    );
  }
  console.log('');
}
