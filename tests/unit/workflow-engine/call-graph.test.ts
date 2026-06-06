import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { BackendAnalyzer } from '../../../packages/backend-analyzer/dist/index.js';
import {
  CallGraphAnalyzer,
  WorkflowEngine,
} from '../../../packages/workflow-engine/dist/index.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))
  );
});

test('detects an exported function that orchestrates known tools', async () => {
  const filePath = await writeFixture(`
export async function addItemToCart(productId: string) {}
export async function checkoutCart() {}
export async function processPayment() {}

export async function completePurchase(productId: string) {
  await addItemToCart(productId);
  await checkoutCart();
  await processPayment();
}
`);

  const tools = [
    tool('addItemToCart', filePath),
    tool('checkoutCart', filePath),
    tool('processPayment', filePath),
    tool('completePurchase', filePath, ['productId'], ['string']),
  ];

  const workflows = await new CallGraphAnalyzer(tools).extract();

  assert.deepEqual(workflows, [
    {
      name: 'completePurchaseWorkflow',
      description:
        'Workflow inferred from completePurchase: addItemToCart -> checkoutCart -> processPayment',
      steps: ['addItemToCart', 'checkoutCart', 'processPayment'],
      source: 'workflow',
      params: ['productId'],
      paramTypes: ['string'],
      returnType: 'void',
      filePath,
      permission: 'UNKNOWN',
      isAsync: true,
    },
  ]);
});

test('resolves class method calls to extracted class tool names', async () => {
  const filePath = await writeFixture(`
export class OrderService {
  async reserveInventory() {}
  async chargeCustomer() {}

  async placeOrder() {
    await this.reserveInventory();
    await this.chargeCustomer();
  }
}
`);

  const tools = [
    tool('OrderService_reserveInventory', filePath),
    tool('OrderService_chargeCustomer', filePath),
    tool('OrderService_placeOrder', filePath),
  ];

  const workflows = await new CallGraphAnalyzer(tools).extract();

  assert.equal(workflows.length, 1);
  assert.equal(workflows[0].name, 'OrderService_placeOrderWorkflow');
  assert.deepEqual(workflows[0].steps, [
    'OrderService_reserveInventory',
    'OrderService_chargeCustomer',
  ]);
});

test('preserves first-call order and removes repeated calls', async () => {
  const filePath = await writeFixture(`
export async function validateOrder() {}
export async function saveOrder() {}

export async function submitOrder() {
  await validateOrder();
  await validateOrder();
  await saveOrder();
}
`);

  const tools = [
    tool('validateOrder', filePath),
    tool('saveOrder', filePath),
    tool('submitOrder', filePath),
  ];

  const workflows = await new CallGraphAnalyzer(tools).extract();

  assert.deepEqual(workflows[0].steps, ['validateOrder', 'saveOrder']);
});

test('does not emit a workflow for a function with fewer than two known calls', async () => {
  const filePath = await writeFixture(`
export async function getOrder() {}
export async function inspectOrder() {
  console.log('checking');
  return getOrder();
}
`);

  const tools = [
    tool('getOrder', filePath),
    tool('inspectOrder', filePath),
  ];

  const workflows = await new CallGraphAnalyzer(tools).extract();

  assert.deepEqual(workflows, []);
});

test('WorkflowEngine includes call-graph workflows alongside heuristic workflows', async () => {
  const filePath = await writeFixture(`
export async function refundOrder() {}
export async function sendMessage() {}
export async function resolveRefund() {
  await refundOrder();
  await sendMessage();
}
`);

  const tools = [
    tool('refundOrder', filePath),
    tool('sendMessage', filePath),
    tool('resolveRefund', filePath),
  ];

  const workflows = await new WorkflowEngine(tools).extract();

  assert.ok(workflows.some(workflow => workflow.name === 'resolveRefundWorkflow'));
  assert.ok(workflows.some(workflow => workflow.name === 'refundAndNotifyWorkflow'));
});

test('detects workflows through the backend analyzer pipeline', async () => {
  const filePath = await writeFixture(`
export async function verifyAccount(accountId: string) {}
export async function provisionWorkspace(accountId: string) {}

export async function onboardAccount(accountId: string) {
  await verifyAccount(accountId);
  await provisionWorkspace(accountId);
}
`);

  const tools = await new BackendAnalyzer(path.dirname(filePath)).extract();
  const workflows = await new WorkflowEngine(tools).extract();
  const workflow = workflows.find(item => item.name === 'onboardAccountWorkflow');

  assert.ok(workflow);
  assert.deepEqual(workflow.steps, ['verifyAccount', 'provisionWorkspace']);
  assert.deepEqual(workflow.params, ['accountId']);
});

async function writeFixture(source: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpify-call-graph-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'workflow.ts');
  await fs.writeFile(filePath, source, 'utf8');
  return filePath;
}

function tool(
  name: string,
  filePath: string,
  params: string[] = [],
  paramTypes: string[] = []
) {
  return {
    name,
    source: 'backend' as const,
    description: '',
    params,
    paramTypes,
    returnType: 'void',
    filePath,
    permission: 'UNKNOWN' as const,
    isAsync: true,
  };
}
