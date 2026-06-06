import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveIntent } from '../../../packages/frontend-analyzer/dist/index.js';

test('resolves common UI intent labels to canonical action names', () => {
  assert.equal(resolveIntent('Proceed to checkout')?.action, 'checkoutCart');
  assert.equal(resolveIntent('Submit support ticket')?.action, 'createSupportRequest');
  assert.equal(resolveIntent('Save changes')?.action, 'saveChanges');
  assert.equal(resolveIntent('Refresh')?.action, 'refreshData');
});
