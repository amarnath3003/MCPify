import path from 'node:path';
import type { ExtractedTool, PermissionLevel, ToolSource, Workflow } from '@mcpify/schema-engine';

export type GraphNodeType = 'tool' | 'workflow' | 'file' | 'source' | 'permission' | 'entity';

export type GraphEdgeType =
  | 'defined_in'
  | 'from_source'
  | 'has_permission'
  | 'orchestrates'
  | 'acts_on'
  | 'related_to';

export interface AppGraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  metadata: Record<string, unknown>;
}

export interface AppGraphEdge {
  id: string;
  from: string;
  to: string;
  type: GraphEdgeType;
  label: string;
  weight: number;
  metadata: Record<string, unknown>;
}

export interface AppGraph {
  nodes: AppGraphNode[];
  edges: AppGraphEdge[];
}

const ACTION_PREFIXES = [
  'handle', 'consume', 'create', 'get', 'list', 'update', 'delete', 'remove',
  'add', 'set', 'send', 'submit', 'fetch', 'find', 'search', 'filter', 'sort',
  'export', 'import', 'upload', 'download', 'publish', 'unpublish', 'archive',
  'restore', 'approve', 'reject', 'cancel', 'confirm', 'process', 'initiate',
  'enable', 'disable', 'assign', 'resolve', 'escalate', 'invite', 'register',
  'verify', 'authenticate', 'logout', 'refund', 'duplicate', 'notify', 'share',
  'reply',
];

export class GraphBuilder {
  build(tools: ExtractedTool[], workflows: Workflow[] = []): AppGraph {
    const nodes = new Map<string, AppGraphNode>();
    const edges = new Map<string, AppGraphEdge>();

    for (const tool of tools) {
      const toolId = toolNodeId(tool.name);
      addNode(nodes, {
        id: toolId,
        type: 'tool',
        label: tool.name,
        metadata: {
          source: tool.source,
          description: tool.description,
          params: tool.params,
          filePath: tool.filePath,
          permission: tool.permission,
        },
      });

      this.addFileSourcePermission(nodes, edges, toolId, tool);
      this.addEntity(nodes, edges, toolId, tool.name);
    }

    for (const workflow of workflows) {
      const workflowId = workflowNodeId(workflow.name);
      addNode(nodes, {
        id: workflowId,
        type: 'workflow',
        label: workflow.name,
        metadata: {
          description: workflow.description,
          permission: workflow.permission,
          steps: workflow.steps,
        },
      });

      this.addFileSourcePermission(nodes, edges, workflowId, workflow);

      for (const [index, step] of workflow.steps.entries()) {
        addEdge(edges, workflowId, toolNodeId(step), 'orchestrates', `step ${index + 1}`, 1, { index });
      }
    }

    addEntityRelations(nodes, edges);

    return {
      nodes: [...nodes.values()],
      edges: [...edges.values()],
    };
  }

  private addFileSourcePermission(
    nodes: Map<string, AppGraphNode>,
    edges: Map<string, AppGraphEdge>,
    nodeId: string,
    item: ExtractedTool
  ): void {
    if (item.filePath) {
      const fileId = fileNodeId(item.filePath);
      addNode(nodes, {
        id: fileId,
        type: 'file',
        label: path.basename(item.filePath),
        metadata: { filePath: item.filePath },
      });
      addEdge(edges, nodeId, fileId, 'defined_in', 'defined in', 1, {});
    }

    const sourceId = sourceNodeId(item.source);
    addNode(nodes, {
      id: sourceId,
      type: 'source',
      label: item.source,
      metadata: { source: item.source },
    });
    addEdge(edges, nodeId, sourceId, 'from_source', 'from source', 1, {});

    const permissionId = permissionNodeId(item.permission);
    addNode(nodes, {
      id: permissionId,
      type: 'permission',
      label: item.permission,
      metadata: { permission: item.permission },
    });
    addEdge(edges, nodeId, permissionId, 'has_permission', 'has permission', 1, {});
  }

  private addEntity(
    nodes: Map<string, AppGraphNode>,
    edges: Map<string, AppGraphEdge>,
    toolId: string,
    name: string
  ): void {
    const entity = extractEntity(name);
    if (!entity) return;

    const entityId = entityNodeId(entity);
    addNode(nodes, {
      id: entityId,
      type: 'entity',
      label: entity,
      metadata: { entity },
    });
    addEdge(edges, toolId, entityId, 'acts_on', 'acts on', 1, {});
  }
}

export class GraphQuery {
  private nodes = new Map<string, AppGraphNode>();
  private outgoing = new Map<string, AppGraphEdge[]>();
  private incoming = new Map<string, AppGraphEdge[]>();

  constructor(private graph: AppGraph) {
    for (const node of graph.nodes) {
      this.nodes.set(node.id, node);
    }

    for (const edge of graph.edges) {
      const out = this.outgoing.get(edge.from) ?? [];
      out.push(edge);
      this.outgoing.set(edge.from, out);

      const inc = this.incoming.get(edge.to) ?? [];
      inc.push(edge);
      this.incoming.set(edge.to, inc);
    }
  }

  getNode(id: string): AppGraphNode | undefined {
    return this.nodes.get(id);
  }

  nodesByType(type: GraphNodeType): AppGraphNode[] {
    return this.graph.nodes.filter(node => node.type === type);
  }

  toolsForEntity(entity: string): AppGraphNode[] {
    const entityId = entityNodeId(entity);
    return (this.incoming.get(entityId) ?? [])
      .filter(edge => edge.type === 'acts_on')
      .map(edge => this.nodes.get(edge.from))
      .filter((node): node is AppGraphNode => Boolean(node));
  }

  workflowsUsingTool(toolName: string): AppGraphNode[] {
    const toolId = toolNodeId(toolName);
    return (this.incoming.get(toolId) ?? [])
      .filter(edge => edge.type === 'orchestrates')
      .map(edge => this.nodes.get(edge.from))
      .filter((node): node is AppGraphNode => Boolean(node));
  }

  neighbors(id: string): AppGraphNode[] {
    return (this.outgoing.get(id) ?? [])
      .map(edge => this.nodes.get(edge.to))
      .filter((node): node is AppGraphNode => Boolean(node));
  }

  shortestPath(from: string, to: string): string[] {
    const queue: Array<{ id: string; path: string[] }> = [{ id: from, path: [from] }];
    const seen = new Set<string>([from]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.id === to) return current.path;

      for (const edge of this.outgoing.get(current.id) ?? []) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        queue.push({ id: edge.to, path: [...current.path, edge.to] });
      }
    }

    return [];
  }
}

export class GraphWorkflowDetector {
  detect(tools: ExtractedTool[]): Workflow[] {
    const graph = new GraphBuilder().build(tools);
    const query = new GraphQuery(graph);
    const workflows: Workflow[] = [];

    for (const entity of query.nodesByType('entity')) {
      const entityName = String(entity.metadata.entity ?? entity.label);
      const relatedTools = query.toolsForEntity(entityName)
        .map(node => String(node.metadata.name ?? node.label))
        .filter(name => tools.some(tool => tool.name === name));
      const orderedSteps = orderLifecycleSteps(relatedTools);

      if (orderedSteps.length < 3) continue;

      const sourceTypes = new Set(
        orderedSteps
          .map(name => tools.find(tool => tool.name === name)?.source)
          .filter(Boolean)
      );
      if (sourceTypes.size < 2) continue;

      workflows.push(makeGraphWorkflow(entityName, orderedSteps));
    }

    return dedupeWorkflows(workflows);
  }
}

export function toMermaid(graph: AppGraph): string {
  const lines = ['flowchart LR'];
  for (const node of graph.nodes) {
    lines.push(`  ${mermaidId(node.id)}["${escapeMermaid(node.label)}"]`);
  }
  for (const edge of graph.edges) {
    lines.push(`  ${mermaidId(edge.from)} -->|"${escapeMermaid(edge.label)}"| ${mermaidId(edge.to)}`);
  }
  return lines.join('\n');
}

export function toolNodeId(name: string): string {
  return `tool:${name}`;
}

export function workflowNodeId(name: string): string {
  return `workflow:${name}`;
}

function fileNodeId(filePath: string): string {
  return `file:${path.resolve(filePath).replace(/\\/g, '/')}`;
}

function sourceNodeId(source: ToolSource): string {
  return `source:${source}`;
}

function permissionNodeId(permission: PermissionLevel): string {
  return `permission:${permission}`;
}

function entityNodeId(entity: string): string {
  return `entity:${entity.toLowerCase()}`;
}

function addNode(nodes: Map<string, AppGraphNode>, node: AppGraphNode): void {
  if (!nodes.has(node.id)) nodes.set(node.id, node);
}

function addEdge(
  edges: Map<string, AppGraphEdge>,
  from: string,
  to: string,
  type: GraphEdgeType,
  label: string,
  weight: number,
  metadata: Record<string, unknown>
): void {
  const id = `${from}->${type}->${to}`;
  if (edges.has(id)) return;
  edges.set(id, { id, from, to, type, label, weight, metadata });
}

function addEntityRelations(nodes: Map<string, AppGraphNode>, edges: Map<string, AppGraphEdge>): void {
  const entityToolIds = new Map<string, string[]>();

  for (const edge of edges.values()) {
    if (edge.type !== 'acts_on') continue;
    const ids = entityToolIds.get(edge.to) ?? [];
    ids.push(edge.from);
    entityToolIds.set(edge.to, ids);
  }

  for (const toolIds of entityToolIds.values()) {
    for (const from of toolIds) {
      for (const to of toolIds) {
        if (from === to || !nodes.has(from) || !nodes.has(to)) continue;
        addEdge(edges, from, to, 'related_to', 'related', 0.5, {});
      }
    }
  }
}

function extractEntity(name: string): string | null {
  let stripped = name;
  for (const prefix of ACTION_PREFIXES) {
    if (name.toLowerCase().startsWith(prefix) && name.length > prefix.length) {
      stripped = name.slice(prefix.length);
      break;
    }
  }

  if (stripped === name) return null;
  stripped = stripped
    .replace(/^(By|One|Many|All)/, '')
    .replace(/(ById|Event|Queue|Topic|Webhook|Workflow)$/, '')
    .replace(/(Created|Updated|Deleted|Paid|Shipped|Succeeded|Failed|Completed|Cancelled|Canceled)$/, '');

  if (!stripped || stripped.length < 3) return null;
  return singularize(stripped.charAt(0).toLowerCase() + stripped.slice(1));
}

function singularize(value: string): string {
  if (value.endsWith('ies')) return `${value.slice(0, -3)}y`;
  if (value.endsWith('s') && !value.endsWith('ss')) return value.slice(0, -1);
  return value;
}

function orderLifecycleSteps(names: string[]): string[] {
  const priority = [
    /^handle/i,
    /^consume/i,
    /^(create|register|add|invite)/i,
    /^(get|list|find|fetch|search)/i,
    /^(update|edit|save|approve|process|send|notify)/i,
    /^(delete|remove|archive|cancel|reject)/i,
  ];

  return [...new Set(names)].sort((a, b) => {
    const aRank = priority.findIndex(pattern => pattern.test(a));
    const bRank = priority.findIndex(pattern => pattern.test(b));
    return normalizeRank(aRank) - normalizeRank(bRank) || a.localeCompare(b);
  });
}

function normalizeRank(rank: number): number {
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
}

function makeGraphWorkflow(entityName: string, steps: string[]): Workflow {
  const capital = entityName.charAt(0).toUpperCase() + entityName.slice(1);
  return {
    name: `${entityName}GraphWorkflow`,
    description: `Graph-inferred workflow connecting ${capital} operations across sources`,
    steps,
    source: 'workflow',
    params: [],
    paramTypes: [],
    returnType: 'void',
    filePath: '',
    permission: 'UNKNOWN',
    isAsync: true,
  };
}

function dedupeWorkflows(workflows: Workflow[]): Workflow[] {
  const seen = new Set<string>();
  return workflows.filter(workflow => {
    if (seen.has(workflow.name)) return false;
    seen.add(workflow.name);
    return true;
  });
}

function mermaidId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function escapeMermaid(value: string): string {
  return value.replace(/"/g, '\\"');
}
