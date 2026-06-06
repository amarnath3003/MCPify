import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { EventAnalyzer } from '../../../packages/event-analyzer/dist/index.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))
  );
});

test('extracts EventEmitter listeners as event tools', async () => {
  const root = await makeProject({
    'src/events.ts': `
import { EventEmitter } from 'node:events';

const eventBus = new EventEmitter();

eventBus.on('order.paid', async (event) => {
  await notifyWarehouse(event);
});
`,
  });

  const tools = await new EventAnalyzer(root).extract();
  const tool = tools.find(item => item.name === 'handleOrderPaidEvent');

  assert.equal(tool?.source, 'event');
  assert.equal(tool?.isAsync, true);
  assert.deepEqual(tool?.params, ['event']);
  assert.equal(tool?.jsdocTags?.eventKind, 'eventemitter');
});

test('extracts RabbitMQ consumers as event tools', async () => {
  const root = await makeProject({
    'src/rabbit.ts': `
export async function start(channel) {
  channel.consume('invoice.created', async (message) => {
    await handleInvoice(message);
  });
}
`,
  });

  const tools = await new EventAnalyzer(root).extract();
  const tool = tools.find(item => item.name === 'consumeInvoiceCreatedQueue');

  assert.equal(tool?.description, 'Consumes RabbitMQ messages from the "invoice.created" queue');
  assert.deepEqual(tool?.params, ['message']);
  assert.equal(tool?.jsdocTags?.eventKind, 'rabbitmq');
});

test('extracts Kafka topic subscriptions as event tools', async () => {
  const root = await makeProject({
    'src/kafka.ts': `
export async function start(consumer) {
  await consumer.subscribe({ topic: 'orders.shipped', fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => processMessage(message),
  });
}
`,
  });

  const tools = await new EventAnalyzer(root).extract();
  const tool = tools.find(item => item.name === 'consumeOrdersShippedTopic');

  assert.equal(tool?.source, 'event');
  assert.equal(tool?.jsdocTags?.eventKind, 'kafka');
});

test('extracts webhook routes as event tools', async () => {
  const root = await makeProject({
    'src/webhooks.ts': `
import express from 'express';

const router = express.Router();

router.post('/webhooks/stripe/payment-succeeded', async (req, res) => {
  await syncStripePayment(req.body);
  res.sendStatus(204);
});
`,
  });

  const tools = await new EventAnalyzer(root).extract();
  const tool = tools.find(item => item.name === 'handleWebhooksStripePaymentSucceededWebhook');

  assert.equal(tool?.httpMethod, 'POST');
  assert.equal(tool?.httpPath, '/webhooks/stripe/payment-succeeded');
  assert.deepEqual(tool?.params, ['payload']);
  assert.equal(tool?.jsdocTags?.eventKind, 'webhook');
});

async function makeProject(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpify-events-'));
  tempDirs.push(root);

  await fs.writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      allowJs: true,
      strict: true,
    },
    include: ['src/**/*'],
  }, null, 2), 'utf8');

  for (const [relativePath, source] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, source, 'utf8');
  }

  return root;
}
