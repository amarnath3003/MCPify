// ─────────────────────────────────────────────────────────────────────────────
// watcher.ts  —  chokidar file watcher for live re-generation
// ─────────────────────────────────────────────────────────────────────────────

import chokidar from 'chokidar';
import chalk from 'chalk';
import { runAnalysis, type AnalyzeOptions } from './commands/analyze.js';

// Debounce: wait this many ms after last change before re-running
const DEBOUNCE_MS = 600;

export async function startWatcher(
  rootPath: string,
  outDir:   string,
  opts:     Omit<AnalyzeOptions, 'output' | 'watch'>
) {
  console.log(chalk.cyan('\n  👁   Watch mode active. Ctrl+C to stop.\n'));

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  const watcher = chokidar.watch(
    ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.vue', '**/schema.prisma'],
    {
      cwd:        rootPath,
      ignored:    /(node_modules|\.mcpify|dist|\.git|\.next|\.turbo)/,
      persistent: true,
      ignoreInitial: true,
    }
  );

  const rerun = (changedFile: string) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (running) return;
      running = true;

      const time = new Date().toLocaleTimeString();
      console.log(`\n  ${chalk.dim(time)}  ${chalk.yellow('↺')}  ${chalk.dim(changedFile)} changed — regenerating…\n`);

      try {
        await runAnalysis(rootPath, { ...opts, output: outDir, watch: false });
      } catch (err: any) {
        console.log(chalk.red(`  Error during regeneration: ${err.message}\n`));
      } finally {
        running = false;
      }
    }, DEBOUNCE_MS);
  };

  watcher
    .on('change', rerun)
    .on('add',    rerun)
    .on('unlink', rerun)
    .on('error',  (err) => console.log(chalk.red(`  Watcher error: ${err}`)));

  // Keep process alive
  await new Promise<void>((_, reject) => {
    process.on('SIGINT',  () => { watcher.close(); reject(new Error('interrupted')); });
    process.on('SIGTERM', () => { watcher.close(); reject(new Error('terminated')); });
  }).catch(() => {
    console.log(chalk.dim('\n  Watch mode stopped.\n'));
    process.exit(0);
  });
}
