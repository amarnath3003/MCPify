import type { PermissionLevel } from '@mcpify/schema-engine';

export type MonitoringEventType =
  | 'tool_call'
  | 'tool_success'
  | 'tool_error'
  | 'confirmation_required'
  | 'confirmation_granted'
  | 'blocked_attempt';

export interface MonitoringEvent {
  id: string;
  type: MonitoringEventType;
  toolName: string;
  agentId?: string;
  sessionId?: string;
  permission?: PermissionLevel;
  timestamp: string;
  durationMs?: number;
  metadata: Record<string, unknown>;
}

export interface ToolUsageSummary {
  toolName: string;
  calls: number;
  successes: number;
  errors: number;
  confirmationsRequired: number;
  confirmationsGranted: number;
  blockedAttempts: number;
  averageDurationMs: number;
}

export interface AnalyticsSummary {
  totalEvents: number;
  totalToolCalls: number;
  totalSuccesses: number;
  totalErrors: number;
  totalConfirmationsRequired: number;
  totalConfirmationsGranted: number;
  totalBlockedAttempts: number;
  blockedAttemptRate: number;
  confirmationGrantRate: number;
  topTools: ToolUsageSummary[];
}

export interface TrackEventInput {
  toolName: string;
  agentId?: string;
  sessionId?: string;
  permission?: PermissionLevel;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export class UsageTracker {
  private events: MonitoringEvent[] = [];
  private sequence = 0;

  track(type: MonitoringEventType, input: TrackEventInput): MonitoringEvent {
    const event: MonitoringEvent = {
      id: `evt_${++this.sequence}`,
      type,
      toolName: input.toolName,
      agentId: input.agentId,
      sessionId: input.sessionId,
      permission: input.permission,
      timestamp: new Date().toISOString(),
      durationMs: input.durationMs,
      metadata: input.metadata ?? {},
    };
    this.events.push(event);
    return event;
  }

  trackCall(input: TrackEventInput): MonitoringEvent {
    return this.track('tool_call', input);
  }

  trackSuccess(input: TrackEventInput): MonitoringEvent {
    return this.track('tool_success', input);
  }

  trackError(input: TrackEventInput): MonitoringEvent {
    return this.track('tool_error', input);
  }

  all(): MonitoringEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
    this.sequence = 0;
  }
}

export class ConfirmationTracker {
  constructor(private usageTracker: UsageTracker) {}

  required(input: TrackEventInput): MonitoringEvent {
    return this.usageTracker.track('confirmation_required', input);
  }

  granted(input: TrackEventInput): MonitoringEvent {
    return this.usageTracker.track('confirmation_granted', input);
  }
}

export class BlockedAttemptLogger {
  constructor(private usageTracker: UsageTracker) {}

  log(input: TrackEventInput): MonitoringEvent {
    return this.usageTracker.track('blocked_attempt', {
      ...input,
      permission: input.permission ?? 'BLOCKED',
    });
  }
}

export class AnalyticsExporter {
  constructor(private events: MonitoringEvent[]) {}

  summary(limit = 10): AnalyticsSummary {
    const toolSummaries = this.toolSummaries();
    const totalConfirmationsRequired = count(this.events, 'confirmation_required');
    const totalConfirmationsGranted = count(this.events, 'confirmation_granted');
    const totalBlockedAttempts = count(this.events, 'blocked_attempt');
    const totalToolCalls = count(this.events, 'tool_call');

    return {
      totalEvents: this.events.length,
      totalToolCalls,
      totalSuccesses: count(this.events, 'tool_success'),
      totalErrors: count(this.events, 'tool_error'),
      totalConfirmationsRequired,
      totalConfirmationsGranted,
      totalBlockedAttempts,
      blockedAttemptRate: ratio(totalBlockedAttempts, totalToolCalls + totalBlockedAttempts),
      confirmationGrantRate: ratio(totalConfirmationsGranted, totalConfirmationsRequired),
      topTools: toolSummaries
        .sort((a, b) => b.calls - a.calls || b.blockedAttempts - a.blockedAttempts)
        .slice(0, limit),
    };
  }

  toolSummaries(): ToolUsageSummary[] {
    const names = new Set(this.events.map(event => event.toolName));
    return [...names].map(toolName => {
      const events = this.events.filter(event => event.toolName === toolName);
      const durations = events
        .map(event => event.durationMs)
        .filter((duration): duration is number => typeof duration === 'number');

      return {
        toolName,
        calls: count(events, 'tool_call'),
        successes: count(events, 'tool_success'),
        errors: count(events, 'tool_error'),
        confirmationsRequired: count(events, 'confirmation_required'),
        confirmationsGranted: count(events, 'confirmation_granted'),
        blockedAttempts: count(events, 'blocked_attempt'),
        averageDurationMs: durations.length === 0
          ? 0
          : Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length),
      };
    });
  }

  toJson(): string {
    return JSON.stringify({
      summary: this.summary(),
      events: this.events,
    }, null, 2);
  }

  toCsv(): string {
    const rows = [
      ['timestamp', 'type', 'toolName', 'agentId', 'sessionId', 'permission', 'durationMs'],
      ...this.events.map(event => [
        event.timestamp,
        event.type,
        event.toolName,
        event.agentId ?? '',
        event.sessionId ?? '',
        event.permission ?? '',
        event.durationMs?.toString() ?? '',
      ]),
    ];

    return rows.map(row => row.map(csvCell).join(',')).join('\n');
  }
}

export function createMonitoringSuite(): {
  usageTracker: UsageTracker;
  confirmationTracker: ConfirmationTracker;
  blockedAttemptLogger: BlockedAttemptLogger;
} {
  const usageTracker = new UsageTracker();
  return {
    usageTracker,
    confirmationTracker: new ConfirmationTracker(usageTracker),
    blockedAttemptLogger: new BlockedAttemptLogger(usageTracker),
  };
}

function count(events: MonitoringEvent[], type: MonitoringEventType): number {
  return events.filter(event => event.type === type).length;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Number((numerator / denominator).toFixed(4));
}

function csvCell(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
