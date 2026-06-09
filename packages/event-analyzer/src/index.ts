import path from 'node:path';
import { Project, SyntaxKind, Node, type CallExpression, type SourceFile } from 'ts-morph';
import type { ExtractedTool } from '@mcpify/schema-engine';

type EventKind = 'eventemitter' | 'rabbitmq' | 'kafka' | 'webhook';

interface EventCandidate {
  kind: EventKind;
  name: string;
  description: string;
  filePath: string;
  isAsync: boolean;
  params?: string[];
  paramTypes?: string[];
  httpMethod?: string;
  httpPath?: string;
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
const EVENT_METHODS = new Set(['on', 'once', 'addListener', 'prependListener']);

export class EventAnalyzer {
  private project: Project;

  constructor(private rootPath: string) {
    const tsconfigPath = path.join(rootPath, 'tsconfig.json');
    try {
      this.project = new Project({
        tsConfigFilePath: tsconfigPath,
        skipAddingFilesFromTsConfig: false,
        skipFileDependencyResolution: true,
      });
    } catch {
      this.project = new Project({
        compilerOptions: {
          target: 99,
          allowJs: true,
          checkJs: false,
          strict: true,
        },
        skipFileDependencyResolution: true,
      });
      this.project.addSourceFilesAtPaths([
        path.join(rootPath, '**/*.ts'),
        path.join(rootPath, '**/*.tsx'),
        path.join(rootPath, '**/*.js'),
        path.join(rootPath, '**/*.jsx'),
        '!' + path.join(rootPath, '**/node_modules/**'),
        '!' + path.join(rootPath, '**/dist/**'),
        '!' + path.join(rootPath, '**/build/**'),
        '!' + path.join(rootPath, '**/.next/**'),
        '!' + path.join(rootPath, '**/.mcpify/**'),
      ]);
    }
  }

  async extract(): Promise<ExtractedTool[]> {
    const tools: ExtractedTool[] = [];

    for (const sourceFile of this.project.getSourceFiles()) {
      if (shouldSkip(sourceFile)) continue;
      tools.push(...this.extractFromFile(sourceFile));
    }

    return dedupeTools(tools);
  }

  private extractFromFile(sourceFile: SourceFile): ExtractedTool[] {
    const candidates: EventCandidate[] = [];

    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const webhook = webhookCandidate(call, sourceFile);
      if (webhook) candidates.push(webhook);

      const emitter = eventEmitterCandidate(call, sourceFile);
      if (emitter) candidates.push(emitter);

      const rabbit = rabbitMqCandidate(call, sourceFile);
      if (rabbit) candidates.push(rabbit);

      const kafka = kafkaCandidate(call, sourceFile);
      if (kafka) candidates.push(kafka);
    }

    return candidates.map(candidateToTool);
  }
}

export class EventEmitterAnalyzer extends EventAnalyzer {}
export class RabbitMQAnalyzer extends EventAnalyzer {}
export class KafkaAnalyzer extends EventAnalyzer {}
export class WebhookAnalyzer extends EventAnalyzer {}

function webhookCandidate(call: CallExpression, sourceFile: SourceFile): EventCandidate | null {
  const access = memberAccess(call);
  if (!access || !HTTP_METHODS.has(access.method)) return null;

  const routeArg = call.getArguments()[0];
  if (!routeArg) return null;

  const route = stringLiteralValue(routeArg);
  if (!route || !isWebhookRoute(route)) return null;

  return {
    kind: 'webhook',
    name: `handle${pascal(route)}Webhook`,
    description: `Handles ${access.method.toUpperCase()} webhook requests for ${route}`,
    filePath: sourceFile.getFilePath(),
    isAsync: callbackIsAsync(call),
    params: ['payload'],
    paramTypes: ['unknown'],
    httpMethod: access.method.toUpperCase(),
    httpPath: route,
  };
}

function eventEmitterCandidate(call: CallExpression, sourceFile: SourceFile): EventCandidate | null {
  const access = memberAccess(call);
  if (!access || !EVENT_METHODS.has(access.method)) return null;
  if (access.object === 'process' || access.object === 'document' || access.object === 'window') return null;

  const eventArg = call.getArguments()[0];
  const eventName = eventArg ? stringLiteralValue(eventArg) : null;
  if (!eventName) return null;

  return {
    kind: 'eventemitter',
    name: `handle${pascal(eventName)}Event`,
    description: `Handles the "${eventName}" event emitted by ${access.object}`,
    filePath: sourceFile.getFilePath(),
    isAsync: callbackIsAsync(call),
    params: ['event'],
    paramTypes: ['unknown'],
  };
}

function rabbitMqCandidate(call: CallExpression, sourceFile: SourceFile): EventCandidate | null {
  const access = memberAccess(call);
  if (!access || access.method !== 'consume') return null;

  const queueArg = call.getArguments()[0];
  const queue = queueArg ? stringLiteralValue(queueArg) : null;
  if (!queue) return null;

  return {
    kind: 'rabbitmq',
    name: `consume${pascal(queue)}Queue`,
    description: `Consumes RabbitMQ messages from the "${queue}" queue`,
    filePath: sourceFile.getFilePath(),
    isAsync: callbackIsAsync(call),
    params: ['message'],
    paramTypes: ['unknown'],
  };
}

function kafkaCandidate(call: CallExpression, sourceFile: SourceFile): EventCandidate | null {
  const access = memberAccess(call);
  if (!access || access.method !== 'subscribe') return null;

  const firstArg = call.getArguments()[0];
  const topic = firstArg ? topicFromSubscribeArg(firstArg) : null;
  if (!topic) return null;

  return {
    kind: 'kafka',
    name: `consume${pascal(topic)}Topic`,
    description: `Consumes Kafka messages from the "${topic}" topic`,
    filePath: sourceFile.getFilePath(),
    isAsync: callbackIsAsync(call),
    params: ['message'],
    paramTypes: ['unknown'],
  };
}

function candidateToTool(candidate: EventCandidate): ExtractedTool {
  return {
    name: candidate.name,
    source: 'event',
    description: candidate.description,
    params: candidate.params ?? [],
    paramTypes: candidate.paramTypes ?? [],
    returnType: 'void',
    filePath: candidate.filePath,
    permission: 'UNKNOWN',
    isAsync: candidate.isAsync,
    httpMethod: candidate.httpMethod,
    httpPath: candidate.httpPath,
    jsdocTags: { eventKind: candidate.kind },
  };
}

function memberAccess(call: CallExpression): { object: string; method: string } | null {
  const expression = call.getExpression();
  if (!Node.isPropertyAccessExpression(expression)) return null;

  return {
    object: expression.getExpression().getText(),
    method: expression.getName(),
  };
}

function stringLiteralValue(node: Node): string | null {
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralText();
  }

  return null;
}

function topicFromSubscribeArg(node: Node): string | null {
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralText();
  }

  if (!Node.isObjectLiteralExpression(node)) return null;
  const topicProp = node.getProperty('topic');
  if (!topicProp || !Node.isPropertyAssignment(topicProp)) return null;

  return stringLiteralValue(topicProp.getInitializerOrThrow());
}

function callbackIsAsync(call: CallExpression): boolean {
  return call.getArguments().some(arg => {
    if (Node.isArrowFunction(arg) || Node.isFunctionExpression(arg)) {
      return arg.isAsync();
    }
    return false;
  });
}

function isWebhookRoute(route: string): boolean {
  const normalized = route.toLowerCase();
  return normalized.includes('webhook') ||
    normalized.includes('/hooks/') ||
    normalized.includes('/events/');
}

function shouldSkip(sourceFile: SourceFile): boolean {
  const filePath = sourceFile.getFilePath().replace(/\\/g, '/');
  return filePath.includes('/node_modules/') ||
    filePath.includes('/dist/') ||
    filePath.includes('/.mcpify/') ||
    filePath.includes('/.next/') ||
    /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath) ||
    filePath.endsWith('.d.ts');
}

function dedupeTools(tools: ExtractedTool[]): ExtractedTool[] {
  const seen = new Set<string>();
  return tools.filter(tool => {
    const key = `${tool.name}:${tool.filePath}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pascal(value: string): string {
  const words = value
    .replace(/['"`]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const name = words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
  return name || 'Application';
}
