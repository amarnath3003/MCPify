import chokidar from 'chokidar';
import chalk from 'chalk';
import {
  IncrementalUpdater,
  type IncrementalUpdateEvent,
} from '@mcpify/sync-engine';
import type { AnalyzeOptions } from './commands/analyze.js';

const DEBOUNCE_MS = 600;

export async function startWatcher(
  rootPath: string,
  outDir: string,
  opts: Omit<AnalyzeOptions, 'output' | 'watch'>
) {
  console.log(chalk.cyan('\n  Watch mode active. Ctrl+C to stop.\n'));

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let pendingChange: { file: string; event: IncrementalUpdateEvent } | null = null;

  const updater = new IncrementalUpdater(rootPath, outDir, { ...opts, output: outDir });
  const initial = await updater.initialize();
  if (initial.mode === 'full') {
    console.log(chalk.dim(`  Incremental cache initialized with ${initial.totalTools} tools.\n`));
  }

  const watcher = chokidar.watch(
    [
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
      '**/*.jsx',
      '**/*.vue',
      '**/*.svelte',
      '**/*.html',
      '**/*.json',
      '**/*.yaml',
      '**/*.yml',
      '**/schema.prisma',
    ],
    {
      cwd: rootPath,
      ignored: /(node_modules|\.mcpify|dist|\.git|\.next|\.turbo)/,
      persistent: true,
      ignoreInitial: true,
    }
  );

  const rerun = (changedFile: string, event: IncrementalUpdateEvent) => {
    pendingChange = { file: changedFile, event };
    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(async () => {
      if (running) return;
      const change = pendingChange;
      pendingChange = null;
      if (!change) return;

      running = true;
      const time = new Date().toLocaleTimeString();
      console.log(`\n  ${chalk.dim(time)}  ${chalk.yellow('->')}  ${chalk.dim(change.file)} changed - regenerating...\n`);

      try {
        const result = await updater.update(change.file, change.event);
        if (result.mode === 'skipped') {
          console.log(chalk.dim(`  Skipped (${result.reasons.join(', ')})\n`));
        } else {
          console.log(
            chalk.green(`  ${result.mode} sync complete`) +
              chalk.dim(` - ${result.changedTools} changed tools, ${result.totalTools} total tools, ${result.workflows} workflows\n`)
          );
        }
      } catch (err: any) {
        console.log(chalk.red(`  Error during regeneration: ${err.message}\n`));
      } finally {
        running = false;
      }
    }, DEBOUNCE_MS);
  };

  watcher
    .on('change', file => rerun(file, 'change'))
    .on('add', file => rerun(file, 'add'))
    .on('unlink', file => rerun(file, 'unlink'))
    .on('error', err => console.log(chalk.red(`  Watcher error: ${err}`)));

  await new Promise<void>((_, reject) => {
    process.on('SIGINT', () => { watcher.close(); reject(new Error('interrupted')); });
    process.on('SIGTERM', () => { watcher.close(); reject(new Error('terminated')); });
  }).catch(() => {
    console.log(chalk.dim('\n  Watch mode stopped.\n'));
    process.exit(0);
  });
}
