// commands/swagger.ts
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { SwaggerConverter }    from '@mcpify/backend-analyzer';
import { PermissionLayer }     from '@mcpify/permissions';
import { MCPGenerator }        from '@mcpify/mcp-generator';
import { applyRuleBasedDescriptions } from '@mcpify/ai-enhancer';

export async function runSwagger(file: string, opts: { output?: string }) {
  const absFile = path.resolve(file);
  const outDir  = path.resolve(opts.output ?? './.mcpify');

  console.log('\n' + chalk.cyan('  📄  ') + chalk.bold.white('MCPify Swagger Converter') + '\n');

  const s1 = ora({ text: `Converting ${absFile}…`, prefixText: '  ' }).start();
  try {
    const tools       = await SwaggerConverter.fromFile(absFile);
    const classified  = new PermissionLayer().classify(tools);
    const withDesc    = applyRuleBasedDescriptions(classified as any);
    s1.succeed(chalk.dim(`${tools.length} endpoints converted`));

    const s2 = ora({ text: 'Generating MCP server…', prefixText: '  ' }).start();
    const gen    = new MCPGenerator(outDir);
    const output = await gen.generate(withDesc as any, []);
    s2.succeed('Generated');

    console.log('\n' + chalk.green.bold('  ✓ Done!\n'));
    for (const f of output.files) {
      console.log(`    ${chalk.gray('→')} ${chalk.white(f.replace(outDir, '').replace(/^\//, ''))}`);
    }
    console.log('');
  } catch (err: any) {
    s1.fail(chalk.red(`Failed: ${err.message}`));
    process.exit(1);
  }
}
