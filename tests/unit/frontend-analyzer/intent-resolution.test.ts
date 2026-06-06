import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveIntent } from '../../../packages/frontend-analyzer/dist/index.js';

test('returns null for unknown labels so handler names can be used as fallback', () => {
  assert.equal(resolveIntent('Run quarterly reconciliation'), null);
});
