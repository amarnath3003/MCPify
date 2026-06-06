// ─────────────────────────────────────────────────────────────────────────────
// @mcpify/workflow-engine
//
// Detects multi-step workflows from a flat list of extracted tools.
// Uses two complementary strategies:
//   1. Pattern matching  — known sequences like Login→Cart→Checkout→Payment
//   2. Dynamic grouping  — tools sharing a noun (Order, User, Invoice…) that
//      together form a lifecycle are bundled into a management workflow.
// ─────────────────────────────────────────────────────────────────────────────

import type { ExtractedTool, Workflow } from '@mcpify/schema-engine';
import { GraphWorkflowDetector } from '@mcpify/graph-engine';
import { CallGraphAnalyzer } from './call-graph-analyzer.js';

export { CallGraphAnalyzer } from './call-graph-analyzer.js';

// ─────────────────────────────────────────────────────────────────────────────
// Static workflow patterns
// Each pattern requires at least `minMatch` of its steps to be present.
// ─────────────────────────────────────────────────────────────────────────────

interface WorkflowPattern {
  name:        string;
  description: string;
  steps:       string[];
  minMatch:    number;  // minimum steps that must exist to emit this workflow
}

const WORKFLOW_PATTERNS: WorkflowPattern[] = [
  // ── E-commerce ─────────────────────────────────────────────────────────────
  {
    name:        'purchaseWorkflow',
    description: 'Full e-commerce purchase: add items → checkout → payment',
    steps:       ['addItemToCart', 'checkoutCart', 'processPayment'],
    minMatch:    2,
  },
  {
    name:        'guestPurchaseWorkflow',
    description: 'Guest checkout flow: checkout → payment (no account required)',
    steps:       ['checkoutCart', 'applyDiscountCode', 'processPayment'],
    minMatch:    2,
  },
  {
    name:        'refundAndNotifyWorkflow',
    description: 'Refund an order and notify the customer by message',
    steps:       ['refundOrder', 'sendMessage'],
    minMatch:    2,
  },
  {
    name:        'subscriptionManagementWorkflow',
    description: 'Create, modify, or cancel a recurring subscription',
    steps:       ['createSubscription', 'updateRecord', 'cancelSubscription'],
    minMatch:    2,
  },

  // ── Authentication ─────────────────────────────────────────────────────────
  {
    name:        'userOnboardingWorkflow',
    description: 'Register a new user and authenticate them for first use',
    steps:       ['registerUser', 'verifyEmail', 'authenticateUser'],
    minMatch:    2,
  },
  {
    name:        'passwordResetWorkflow',
    description: 'Initiate and complete a password reset for a user',
    steps:       ['initiatePasswordReset', 'verifyEmail', 'updatePassword'],
    minMatch:    2,
  },

  // ── Content / CMS ──────────────────────────────────────────────────────────
  {
    name:        'contentPublishWorkflow',
    description: 'Create, review, and publish content to production',
    steps:       ['createRecord', 'saveChanges', 'approveRequest', 'publishContent'],
    minMatch:    2,
  },
  {
    name:        'contentArchiveWorkflow',
    description: 'Unpublish and archive content',
    steps:       ['unpublishContent', 'archiveRecord'],
    minMatch:    2,
  },

  // ── Support ────────────────────────────────────────────────────────────────
  {
    name:        'supportResolutionWorkflow',
    description: 'Create a support ticket, assign it, and resolve it',
    steps:       ['createSupportRequest', 'assignTask', 'resolveIssue'],
    minMatch:    2,
  },
  {
    name:        'escalationWorkflow',
    description: 'Escalate an issue and notify the relevant party',
    steps:       ['escalateIssue', 'sendNotification'],
    minMatch:    2,
  },

  // ── Files / data ───────────────────────────────────────────────────────────
  {
    name:        'documentSubmissionWorkflow',
    description: 'Upload a document and submit it via form',
    steps:       ['uploadFile', 'submitForm'],
    minMatch:    2,
  },
  {
    name:        'dataExportWorkflow',
    description: 'Filter data and export it to a file',
    steps:       ['filterItems', 'exportData'],
    minMatch:    2,
  },
  {
    name:        'dataImportWorkflow',
    description: 'Import data from a file and validate it',
    steps:       ['importData', 'submitForm'],
    minMatch:    2,
  },

  // ── Search & browse ────────────────────────────────────────────────────────
  {
    name:        'searchAndFilterWorkflow',
    description: 'Search for items and refine by filter and sort criteria',
    steps:       ['searchItems', 'filterItems', 'sortItems'],
    minMatch:    2,
  },

  // ── Admin ──────────────────────────────────────────────────────────────────
  {
    name:        'approvalWorkflow',
    description: 'Review and approve or reject a pending request',
    steps:       ['approveRequest', 'rejectRequest', 'sendNotification'],
    minMatch:    2,
  },
  {
    name:        'userInviteWorkflow',
    description: 'Invite a new user and assign them a role',
    steps:       ['inviteUser', 'assignTask'],
    minMatch:    2,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// VERB_PREFIXES used to extract the noun from an action name
// ─────────────────────────────────────────────────────────────────────────────

const VERB_PREFIXES = [
  'create', 'get', 'list', 'update', 'delete', 'remove', 'add', 'set',
  'send', 'submit', 'fetch', 'find', 'search', 'filter', 'sort', 'export',
  'import', 'upload', 'download', 'publish', 'unpublish', 'archive', 'restore',
  'approve', 'reject', 'cancel', 'confirm', 'process', 'initiate', 'enable',
  'disable', 'assign', 'resolve', 'escalate', 'invite', 'register', 'verify',
  'authenticate', 'logout', 'refund', 'duplicate', 'notify', 'share', 'reply',
];

// ─────────────────────────────────────────────────────────────────────────────
// WorkflowEngine
// ─────────────────────────────────────────────────────────────────────────────

export class WorkflowEngine {
  private toolNames: Set<string>;

  constructor(private tools: ExtractedTool[]) {
    this.toolNames = new Set(tools.map(t => t.name));
  }

  async extract(): Promise<Workflow[]> {
    const all: Workflow[] = [
      ...await new CallGraphAnalyzer(this.tools).extract(),
      ...new GraphWorkflowDetector().detect(this.tools),
      ...this._matchStaticPatterns(),
      ...this._detectDynamicLifecycles(),
    ];

    // Deduplicate by workflow name
    const seen = new Set<string>();
    return all.filter(w => {
      if (seen.has(w.name)) return false;
      seen.add(w.name);
      return true;
    });
  }

  // ── Strategy 1: Static pattern matching ────────────────────────────────────

  private _matchStaticPatterns(): Workflow[] {
    const workflows: Workflow[] = [];

    for (const pattern of WORKFLOW_PATTERNS) {
      const presentSteps = pattern.steps.filter(s => this.toolNames.has(s));
      if (presentSteps.length < pattern.minMatch) continue;

      workflows.push(this._makeWorkflow(
        pattern.name,
        pattern.description,
        presentSteps
      ));
    }

    return workflows;
  }

  // ── Strategy 2: Dynamic lifecycle detection ────────────────────────────────
  //
  // Groups tools by the noun in their name. If a noun appears with 3+ different
  // verbs we assume there's a lifecycle and generate a *Management workflow.

  private _detectDynamicLifecycles(): Workflow[] {
    // noun → tools that act on it
    const groups = new Map<string, ExtractedTool[]>();

    for (const tool of this.tools) {
      const noun = this._extractNoun(tool.name);
      if (!noun || noun.length < 3) continue;
      if (!groups.has(noun)) groups.set(noun, []);
      groups.get(noun)!.push(tool);
    }

    const workflows: Workflow[] = [];

    for (const [noun, tools] of groups.entries()) {
      // Only emit if we have create/update/delete verbs (a real CRUD lifecycle)
      const hasCreate = tools.some(t => /^(create|register|add|new)/.test(t.name));
      const hasRead   = tools.some(t => /^(get|list|find|fetch|search)/.test(t.name));
      const hasMutate = tools.some(t => /^(update|edit|modify|patch)/.test(t.name));
      const hasDelete = tools.some(t => /^(delete|remove|archive|cancel)/.test(t.name));

      const fulfillsLifecycle = [hasCreate, hasRead, hasMutate, hasDelete].filter(Boolean).length >= 3;
      if (!fulfillsLifecycle) continue;

      const capitalNoun = noun.charAt(0).toUpperCase() + noun.slice(1);
      workflows.push(this._makeWorkflow(
        `${noun}ManagementWorkflow`,
        `Full lifecycle management for ${capitalNoun} entities: create, read, update, delete`,
        tools.map(t => t.name)
      ));
    }

    return workflows;
  }

  /** Extract the noun part of a camelCase action name */
  private _extractNoun(name: string): string | null {
    let stripped = name;
    for (const prefix of VERB_PREFIXES) {
      if (name.toLowerCase().startsWith(prefix) && name.length > prefix.length) {
        stripped = name.slice(prefix.length);
        break;
      }
    }
    if (stripped === name) return null; // no verb stripped — not an action name
    // lower-case first letter
    return stripped.charAt(0).toLowerCase() + stripped.slice(1);
  }

  private _makeWorkflow(name: string, description: string, steps: string[]): Workflow {
    return {
      name,
      description,
      steps,
      source:     'workflow',
      params:     [],
      paramTypes: [],
      returnType: 'void',
      filePath:   '',
      permission: 'UNKNOWN',
      isAsync:    true,
    };
  }
}
