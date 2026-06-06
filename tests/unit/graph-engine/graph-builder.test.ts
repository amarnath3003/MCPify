import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GraphBuilder,
  GraphQuery,
  GraphWorkflowDetector,
  toMermaid,
  toolNodeId,
} from '../../../packages/graph-engine/dist/index.js';
import { WorkflowEngine } from '../../../packages/workflow-engine/dist/index.js';

test('builds graph nodes and edges from tools and workflows', () => {
  const graph = new GraphBuilder().build(
    [
      tool('handleOrderPaidEvent', 'event', 'events.ts'),
      tool('getOrderById', 'backend', 'orders.ts'),
      tool('updateOrder', 'backend', 'orders.ts'),
    ],
    [
      {
        ...tool('orderFulfillmentWorkflow', 'workflow', ''),
        source: 'workflow',
        steps: ['handleOrderPaidEvent', 'getOrderById', 'updateOrder'],
      },
    ]
  );

  const query = new GraphQuery(graph);
  const orderTools = query.toolsForEntity('order').map(node => node.label);

  assert.ok(graph.nodes.some(node => node.id === toolNodeId('handleOrderPaidEvent')));
  assert.ok(graph.edges.some(edge => edge.type === 'orchestrates'));
  assert.deepEqual(orderTools.sort(), [
    'getOrderById',
    'handleOrderPaidEvent',
    'updateOrder',
  ]);
});

test('finds graph neighbors and shortest paths', () => {
  const graph = new GraphBuilder().build([
    tool('handleInvoiceCreatedEvent', 'event', 'events.ts'),
    tool('createInvoice', 'database', 'schema.ts'),
  ]);
  const query = new GraphQuery(graph);
  const path = query.shortestPath(toolNodeId('handleInvoiceCreatedEvent'), toolNodeId('createInvoice'));

  assert.deepEqual(path, [
    toolNodeId('handleInvoiceCreatedEvent'),
    toolNodeId('createInvoice'),
  ]);
});

test('detects cross-source graph workflows around an entity', () => {
  const workflows = new GraphWorkflowDetector().detect([
    tool('handleOrderPaidEvent', 'event', 'events.ts'),
    tool('getOrderById', 'backend', 'orders.ts'),
    tool('updateOrder', 'database', 'schema.ts'),
  ]);

  assert.deepEqual(workflows.map(workflow => workflow.name), ['orderGraphWorkflow']);
  assert.deepEqual(workflows[0].steps, [
    'handleOrderPaidEvent',
    'getOrderById',
    'updateOrder',
  ]);
});

test('WorkflowEngine includes graph-inferred workflows', async () => {
  const workflows = await new WorkflowEngine([
    tool('handleOrderPaidEvent', 'event', 'events.ts'),
    tool('getOrderById', 'backend', 'orders.ts'),
    tool('updateOrder', 'database', 'schema.ts'),
  ]).extract();

  assert.ok(workflows.some(workflow => workflow.name === 'orderGraphWorkflow'));
});

test('renders graph output as Mermaid', () => {
  const graph = new GraphBuilder().build([
    tool('handleOrderPaidEvent', 'event', 'events.ts'),
    tool('updateOrder', 'backend', 'orders.ts'),
  ]);

  assert.match(toMermaid(graph), /^flowchart LR/);
  assert.match(toMermaid(graph), /handleOrderPaidEvent/);
});

function tool(
  name: string,
  source: 'backend' | 'frontend' | 'api' | 'database' | 'event' | 'workflow',
  filePath: string
) {
  return {
    name,
    source,
    description: '',
    params: [],
    paramTypes: [],
    returnType: 'void',
    filePath,
    permission: 'UNKNOWN' as const,
    isAsync: true,
  };
}
