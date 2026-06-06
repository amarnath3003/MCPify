import fs from 'node:fs';
import path from 'node:path';
import {
  Node,
  Project,
  ScriptTarget,
  SyntaxKind,
  type SourceFile,
} from 'ts-morph';
import type { ExtractedTool, Workflow } from '@mcpify/schema-engine';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']);

export class CallGraphAnalyzer {
  private readonly backendTools: ExtractedTool[];
  private readonly toolNames: Set<string>;
  private readonly methodAliases: Map<string, string>;

  constructor(tools: ExtractedTool[]) {
    this.backendTools = tools.filter(
      tool =>
        tool.source === 'backend' &&
        SOURCE_EXTENSIONS.has(path.extname(tool.filePath).toLowerCase()) &&
        fs.existsSync(tool.filePath)
    );
    this.toolNames = new Set(this.backendTools.map(tool => tool.name));
    this.methodAliases = this.buildMethodAliases(this.backendTools);
  }

  async extract(): Promise<Workflow[]> {
    if (this.backendTools.length === 0) return [];

    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        allowJs: true,
        checkJs: false,
        target: ScriptTarget.ESNext,
      },
    });

    const filePaths = [...new Set(this.backendTools.map(tool => tool.filePath))];
    project.addSourceFilesAtPaths(filePaths);

    const workflows: Workflow[] = [];
    for (const tool of this.backendTools) {
      const sourceFile = project.getSourceFile(tool.filePath);
      if (!sourceFile) continue;

      const declaration = this.findDeclaration(sourceFile, tool.name);
      if (!declaration) continue;

      const steps = this.findCalledTools(declaration, tool.name);
      if (steps.length < 2) continue;

      workflows.push({
        name: this.workflowName(tool.name),
        description: `Workflow inferred from ${tool.name}: ${steps.join(' -> ')}`,
        steps,
        source: 'workflow',
        params: [...tool.params],
        paramTypes: [...tool.paramTypes],
        returnType: tool.returnType,
        filePath: tool.filePath,
        permission: 'UNKNOWN',
        isAsync: tool.isAsync,
      });
    }

    return workflows;
  }

  private findDeclaration(
    sourceFile: SourceFile,
    toolName: string
  ): Node | undefined {
    const functionDeclaration = sourceFile.getFunction(toolName);
    if (functionDeclaration) return functionDeclaration;

    const variable = sourceFile.getVariableDeclaration(toolName);
    const initializer = variable?.getInitializer();
    if (
      initializer &&
      (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))
    ) {
      return initializer;
    }

    for (const classDeclaration of sourceFile.getClasses()) {
      const className = classDeclaration.getName();
      if (!className || !toolName.startsWith(`${className}_`)) continue;

      const methodName = toolName.slice(className.length + 1);
      const method = classDeclaration.getMethod(methodName);
      if (method) return method;
    }

    return undefined;
  }

  private findCalledTools(
    declaration: Node,
    orchestratorName: string
  ): string[] {
    const steps: string[] = [];
    const seen = new Set<string>();

    for (const call of declaration.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const calledName = this.resolveCalledName(call.getExpression());
      if (!calledName || calledName === orchestratorName || seen.has(calledName)) continue;

      seen.add(calledName);
      steps.push(calledName);
    }

    return steps;
  }

  private resolveCalledName(expression: Node): string | undefined {
    let candidate: string | undefined;

    if (Node.isIdentifier(expression)) {
      candidate = expression.getText();
    } else if (Node.isPropertyAccessExpression(expression)) {
      candidate = expression.getName();
    }

    if (!candidate) return undefined;
    if (this.toolNames.has(candidate)) return candidate;
    return this.methodAliases.get(candidate);
  }

  private buildMethodAliases(tools: ExtractedTool[]): Map<string, string> {
    const aliases = new Map<string, string>();
    const ambiguous = new Set<string>();

    for (const tool of tools) {
      const separator = tool.name.indexOf('_');
      if (separator < 1 || separator === tool.name.length - 1) continue;

      const methodName = tool.name.slice(separator + 1);
      if (aliases.has(methodName)) {
        aliases.delete(methodName);
        ambiguous.add(methodName);
      } else if (!ambiguous.has(methodName)) {
        aliases.set(methodName, tool.name);
      }
    }

    return aliases;
  }

  private workflowName(orchestratorName: string): string {
    return orchestratorName.endsWith('Workflow')
      ? `${orchestratorName}Sequence`
      : `${orchestratorName}Workflow`;
  }
}
