import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { BackendAnalyzer } from '../../../packages/backend-analyzer/dist/index.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))
  );
});

test('extracts Express routes with mount prefixes and skips helpers', async () => {
  const root = await writeProject({ express: '^4' }, {
    'src/server.ts': `
import express from 'express';
const app = express();
const router = express.Router();
router.get('/orders/:id', async (req, res) => res.json({}));
router.post('/orders', async (req, res) => res.json({}));
app.use('/api/v1', router);
export function formatMoney(n: number) { return '$' + n; }
`,
  });

  const tools = await new BackendAnalyzer(root).extract();
  const byName = new Map(tools.map(t => [t.name, t]));

  const get = byName.get('getApiV1OrdersId');
  assert.equal(get?.httpMethod, 'GET');
  assert.equal(get?.httpPath, '/api/v1/orders/:id');
  assert.equal(get?.framework, 'express');
  assert.deepEqual(get?.params, ['id']);

  assert.equal(byName.get('postApiV1Orders')?.httpMethod, 'POST');
  // Pure sync helper is flagged non-reachable.
  assert.equal(byName.get('formatMoney')?.reachable, false);
});

test('onlyReachable drops internal helpers', async () => {
  const root = await writeProject({ express: '^4' }, {
    'src/server.ts': `
import express from 'express';
const app = express();
app.get('/ping', (req, res) => res.send('ok'));
export function toSlug(s: string) { return s; }
`,
  });

  const tools = await new BackendAnalyzer(root).extract({ onlyReachable: true });
  assert.ok(tools.some(t => t.name === 'getPing'));
  assert.ok(!tools.some(t => t.name === 'toSlug'));
});

test('extracts NestJS controller routes from decorators', async () => {
  const root = await writeProject({ '@nestjs/common': '^10' }, {
    'src/users.controller.ts': `
import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
@Controller('users')
export class UsersController {
  @Get(':id')
  getOne(@Param('id') id: string) { return {}; }
  @Post()
  create(@Body() dto: unknown) { return {}; }
  @Get()
  list(@Query('role') role: string) { return []; }
}
`,
  });

  const tools = await new BackendAnalyzer(root).extract();
  const nest = tools.filter(t => t.framework === 'nestjs');
  const byPath = new Map(nest.map(t => [`${t.httpMethod} ${t.httpPath}`, t]));

  assert.equal(byPath.get('GET /users/:id')?.params.join(','), 'id');
  assert.equal(byPath.get('POST /users')?.params.join(','), 'body');
  assert.equal(byPath.get('GET /users')?.params.join(','), 'role');
});

test('expands destructured object params into typed fields', async () => {
  const root = await writeProject({}, {
    'tsconfig.json': JSON.stringify({ compilerOptions: { allowJs: true } }),
    'src/orders.ts': `
export async function refundOrder({ orderId, amount }: { orderId: string; amount: number }) {
  return true;
}
`,
  });

  const tools = await new BackendAnalyzer(root).extract();
  const refund = tools.find(t => t.name === 'refundOrder');
  assert.deepEqual(refund?.params, ['orderId', 'amount']);
  assert.deepEqual(refund?.paramTypes, ['string', 'number']);
});

async function writeProject(
  deps: Record<string, string>,
  files: Record<string, string>,
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpify-fw-'));
  tempDirs.push(dir);
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', dependencies: deps }),
    'utf8',
  );
  for (const [rel, source] of Object.entries(files)) {
    const filePath = path.join(dir, rel);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, source, 'utf8');
  }
  return dir;
}
