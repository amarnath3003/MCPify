import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoleBasedPermissionLayer } from '../../../packages/permissions/dist/index.js';
import type { ExtractedTool } from '../../../packages/schema-engine/dist/index.js';

test('applies exact role-based permission overrides', () => {
  const layer = new RoleBasedPermissionLayer({
    roles: {
      support: {
        rules: [
          {
            tools: ['refundOrder'],
            permission: 'BLOCKED',
            reason: 'Support agents cannot issue refunds.',
          },
        ],
      },
    },
  });

  const [tool] = layer.classifyForRole([
    makeTool('refundOrder'),
  ], 'support');

  assert.equal(tool.permission, 'BLOCKED');
  assert.match(tool.safetyNotes ?? '', /Support agents cannot issue refunds/);
});

test('applies pattern overrides and max permission clamps', () => {
  const layer = new RoleBasedPermissionLayer({
    roles: {
      readonly: {
        maxPermission: 'REQUIRES_CONFIRMATION',
        rules: [
          {
            patterns: ['^get'],
            permission: 'SAFE',
          },
        ],
      },
    },
  });

  const [readTool, writeTool] = layer.classifyForRole([
    makeTool('getOrderById'),
    makeTool('updateOrder'),
  ], 'readonly');

  assert.equal(readTool.permission, 'REQUIRES_CONFIRMATION');
  assert.equal(writeTool.permission, 'REQUIRES_CONFIRMATION');
});

test('unknown roles fall back to base permission classification', () => {
  const layer = new RoleBasedPermissionLayer({ roles: {} });
  const [tool] = layer.classifyForRole([makeTool('getOrderById')], 'missing');

  assert.equal(tool.permission, 'SAFE');
});

function makeTool(name: string): ExtractedTool {
  return {
    name,
    source: 'backend',
    description: '',
    params: [],
    paramTypes: [],
    returnType: 'void',
    filePath: 'orders.ts',
    permission: 'UNKNOWN',
    isAsync: true,
  };
}
