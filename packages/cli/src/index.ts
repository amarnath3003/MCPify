#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// MCPify CLI  —  entry point
// ─────────────────────────────────────────────────────────────────────────────

import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

program
  .name('mcpify')
  .description('Compile software into AI-operable systems')
  .version('0.1.0');

// ── Default: full analysis ────────────────────────────────────────────────────
program
  .command('analyze [path]', { isDefault: true })
  .description('Analyze application and generate MCP server')
  .option('--ai-enhance',       'Use Claude AI to improve tool descriptions')
  .option('--output <dir>',     'Output directory for generated files', './.mcpify')
  .option('--watch',            'Watch source files and re-generate on change')
  .option('--no-frontend',      'Skip frontend analysis')
  .option('--no-events',        'Skip event listener and webhook analysis')
  .option('--no-workflows',     'Skip workflow detection')
  .option('--swagger <file>',   'Also analyze an OpenAPI/Swagger spec file')
  .option('--prisma <file>',    'Also analyze a Prisma schema file')
  .option('--drizzle <path>',    'Also analyze Drizzle table definitions')
  .option('--mongoose <path>',   'Also analyze Mongoose schema/model files')
  .action(async (pathArg: string | undefined, opts) => {
    const { runAnalysis } = await import('./commands/analyze.js');
    await runAnalysis(pathArg ?? '.', opts);
  });

// ── Interactive mode ──────────────────────────────────────────────────────────
program
  .command('interactive')
  .description('Interactively configure what MCPify exposes')
  .action(async () => {
    const { runInteractive } = await import('./commands/interactive.js');
    await runInteractive();
  });

// ── Audit mode ────────────────────────────────────────────────────────────────
program
  .command('audit [path]')
  .description('Static audit — show issues without writing files')
  .option('--output <dir>', 'Read generated files from this directory', './.mcpify')
  .action(async (pathArg: string | undefined, opts) => {
    const { runAudit } = await import('./commands/audit.js');
    await runAudit(pathArg ?? '.', opts);
  });

// ── Frontend-only extraction ──────────────────────────────────────────────────
program
  .command('frontend [path]')
  .description('Extract only UI actions from frontend components')
  .option('--json', 'Output raw JSON')
  .action(async (pathArg: string | undefined, opts) => {
    const { runFrontend } = await import('./commands/frontend.js');
    await runFrontend(pathArg ?? '.', opts);
  });

// ── OpenAPI conversion ────────────────────────────────────────────────────────
program
  .command('swagger <file>')
  .description('Convert an OpenAPI/Swagger spec to MCP tools')
  .option('--output <dir>', 'Output directory', './.mcpify')
  .action(async (file: string, opts) => {
    const { runSwagger } = await import('./commands/swagger.js');
    await runSwagger(file, opts);
  });

// ── AI simulation ─────────────────────────────────────────────────────────────
program
  .command('simulate [path]')
  .description('Simulate AI agent usage and validate security boundaries')
  .option('--output <dir>', 'Directory containing generated tools', './.mcpify')
  .action(async (pathArg: string | undefined, opts) => {
    const { runSimulate } = await import('./commands/simulate.js');
    await runSimulate(pathArg ?? '.', opts);
  });

program.parse(process.argv);
