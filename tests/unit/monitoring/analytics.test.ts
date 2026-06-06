import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AnalyticsExporter,
  createMonitoringSuite,
} from '../../../packages/monitoring/dist/index.js';

test('tracks usage, confirmations, blocked attempts, and exports analytics', () => {
  const {
    usageTracker,
    confirmationTracker,
    blockedAttemptLogger,
  } = createMonitoringSuite();

  usageTracker.trackCall({
    toolName: 'refundOrder',
    agentId: 'codex',
    sessionId: 'session-1',
    permission: 'REQUIRES_CONFIRMATION',
  });
  confirmationTracker.required({
    toolName: 'refundOrder',
    agentId: 'codex',
    sessionId: 'session-1',
    permission: 'REQUIRES_CONFIRMATION',
  });
  confirmationTracker.granted({
    toolName: 'refundOrder',
    agentId: 'codex',
    sessionId: 'session-1',
    permission: 'REQUIRES_CONFIRMATION',
  });
  usageTracker.trackSuccess({
    toolName: 'refundOrder',
    durationMs: 120,
  });
  blockedAttemptLogger.log({
    toolName: 'deleteDatabase',
    agentId: 'codex',
  });

  const exporter = new AnalyticsExporter(usageTracker.all());
  const summary = exporter.summary();

  assert.equal(summary.totalEvents, 5);
  assert.equal(summary.totalToolCalls, 1);
  assert.equal(summary.totalBlockedAttempts, 1);
  assert.equal(summary.confirmationGrantRate, 1);
  assert.equal(summary.blockedAttemptRate, 0.5);
  assert.equal(summary.topTools[0].toolName, 'refundOrder');
  assert.match(exporter.toJson(), /deleteDatabase/);
  assert.match(exporter.toCsv(), /blocked_attempt,deleteDatabase/);
});

test('clears usage events', () => {
  const { usageTracker } = createMonitoringSuite();
  usageTracker.trackCall({ toolName: 'getOrderById' });

  usageTracker.clear();

  assert.deepEqual(usageTracker.all(), []);
});
