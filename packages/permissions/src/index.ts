// ─────────────────────────────────────────────────────────────────────────────
// @mcpify/permissions
//
// Three-tier permission classification engine.
//
//   SAFE                  — read-only / non-destructive operations.
//                           AI agents may execute without asking.
//
//   REQUIRES_CONFIRMATION — mutating but recoverable operations.
//                           AI must ask the user before executing.
//                           The generated MCP server enforces this at runtime
//                           with a { "__confirmed": true } guard.
//
//   BLOCKED               — catastrophic / irreversible operations.
//                           Never exposed to AI agents.  Human-only.
//
// Classification uses three layered strategies (applied in priority order):
//   1. Exact name overrides (highest priority)
//   2. Regex pattern matching against name + description
//   3. HTTP method heuristics (for API tools)
//   4. Source-level defaults (lowest priority)
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ExtractedTool,
  ClassifiedTool,
  PermissionLevel,
  Workflow,
} from '@mcpify/schema-engine';

// ─────────────────────────────────────────────────────────────────────────────
// Pattern tables
// ─────────────────────────────────────────────────────────────────────────────

/** These are ALWAYS blocked regardless of any other signal */
const BLOCKED_PATTERNS: RegExp[] = [
  /delete.*database/i,
  /drop.*table/i,
  /truncate/i,
  /wipe.*all/i,
  /destroy.*all/i,
  /purge.*all/i,
  /nuke/i,
  /format.*disk/i,
  /rm\s*-rf/i,
  /exec.*shell/i,
  /run.*command/i,
  /system.*exec/i,
  /eval.*code/i,
  /mass.*delete/i,
  /delete.*all/i,
  /reset.*production/i,
];

/** These require explicit confirmation before AI may execute */
const CONFIRM_PATTERNS: RegExp[] = [
  /refund/i,
  /delete(?!.*database|.*all)/i,   // delete (but not deleteDatabase / deleteAll — those are BLOCKED)
  /remove(?!FromCart)/i,           // remove (but removeFromCart is safe)
  /cancel/i,
  /reject/i,
  /approve/i,
  /publish/i,
  /unpublish/i,
  /deploy/i,
  /transfer/i,
  /payment/i,
  /charge/i,
  /checkout/i,
  /purchase/i,
  /subscribe/i,
  /unsubscribe/i,
  /ban/i,
  /suspend/i,
  /promote/i,
  /demote/i,
  /assign(?!Task)/i,
  /send.*message/i,
  /send.*email/i,
  /send.*notification/i,
  /invite/i,
  /reset.*password/i,
  /update.*password/i,
  /enable.*2fa/i,
  /escalate/i,
  /archive/i,
  /restore/i,
  /duplicate/i,
  /clone/i,
  /import/i,
  /uploadFile/i,
];

/** These are always safe for autonomous AI execution */
const SAFE_PATTERNS: RegExp[] = [
  /^get/i,
  /^list/i,
  /^search/i,
  /^find/i,
  /^fetch/i,
  /^read/i,
  /^view/i,
  /^filter/i,
  /^sort/i,
  /^count/i,
  /^show/i,
  /^describe/i,
  /^check/i,
  /^inspect/i,
  /^validate(?!.*delete)/i,
  /downloadFile/i,
  /exportData/i,
  /refreshData/i,
  /authenticateUser/i,
  /logoutUser/i,
  /cancelOperation/i,  // UI cancel — just closes a dialog
];

// ─────────────────────────────────────────────────────────────────────────────
// HTTP method → permission heuristics
// ─────────────────────────────────────────────────────────────────────────────

const HTTP_METHOD_PERMISSIONS: Record<string, PermissionLevel> = {
  GET:    'SAFE',
  HEAD:   'SAFE',
  OPTIONS:'SAFE',
  POST:   'REQUIRES_CONFIRMATION',
  PUT:    'REQUIRES_CONFIRMATION',
  PATCH:  'REQUIRES_CONFIRMATION',
  DELETE: 'REQUIRES_CONFIRMATION',
};

// ─────────────────────────────────────────────────────────────────────────────
// Hard overrides — specific action names that bypass pattern matching
// ─────────────────────────────────────────────────────────────────────────────

const EXACT_OVERRIDES: Record<string, PermissionLevel> = {
  // Database destructive ops — always blocked
  deleteDatabase:          'BLOCKED',
  dropTable:               'BLOCKED',
  truncateTable:           'BLOCKED',
  wipeAllData:             'BLOCKED',
  resetProductionDatabase: 'BLOCKED',

  // Auth — safe
  authenticateUser:        'SAFE',
  logoutUser:              'SAFE',
  verifyEmail:             'SAFE',

  // Cart reads — safe
  getCart:                 'SAFE',
  viewCart:                'SAFE',
  listCartItems:           'SAFE',

  // Cart mutations — confirm
  addItemToCart:           'REQUIRES_CONFIRMATION',
  removeItemFromCart:      'REQUIRES_CONFIRMATION',
  checkoutCart:            'REQUIRES_CONFIRMATION',
  processPayment:          'REQUIRES_CONFIRMATION',
  refundOrder:             'REQUIRES_CONFIRMATION',

  // Support — confirm
  createSupportRequest:    'REQUIRES_CONFIRMATION',
  escalateIssue:           'REQUIRES_CONFIRMATION',
};

// ─────────────────────────────────────────────────────────────────────────────
// Safety notes per level
// ─────────────────────────────────────────────────────────────────────────────

function safetyNote(level: PermissionLevel, toolName: string): string {
  switch (level) {
    case 'BLOCKED':
      return `"${toolName}" is blocked for AI agents. This operation must be performed manually by a human.`;
    case 'REQUIRES_CONFIRMATION':
      return `"${toolName}" requires explicit user confirmation. The MCP server will reject calls without { "__confirmed": true }.`;
    case 'SAFE':
      return `"${toolName}" is non-destructive and may be executed autonomously by AI agents.`;
    default:
      return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PermissionLayer
// ─────────────────────────────────────────────────────────────────────────────

export class PermissionLayer {
  /**
   * Classify a list of tools and return ClassifiedTool[].
   * Order: BLOCKED > REQUIRES_CONFIRMATION > SAFE.
   */
  classify(tools: (ExtractedTool | Workflow)[]): ClassifiedTool[] {
    return tools.map(tool => {
      const level = this._classifyOne(tool);
      return {
        ...tool,
        permission:  level,
        safetyNotes: safetyNote(level, tool.name),
      };
    });
  }

  /** Classify a single tool */
  private _classifyOne(tool: ExtractedTool): PermissionLevel {
    const name     = tool.name;
    const combined = `${name} ${tool.description}`.toLowerCase();

    // ── 1. Exact overrides (highest priority) ─────────────────────────────
    if (EXACT_OVERRIDES[name]) return EXACT_OVERRIDES[name];

    // ── 2. Blocked patterns ───────────────────────────────────────────────
    if (BLOCKED_PATTERNS.some(p => p.test(combined))) return 'BLOCKED';

    // ── 3. Workflows: check if any step is blocked ─────────────────────────
    if (tool.source === 'workflow') {
      const steps: string[] = (tool as Workflow).steps ?? [];
      if (steps.some(s => EXACT_OVERRIDES[s] === 'BLOCKED')) return 'BLOCKED';
      if (steps.some(s => CONFIRM_PATTERNS.some(p => p.test(s))))
        return 'REQUIRES_CONFIRMATION';
    }

    // ── 4. Confirm patterns ───────────────────────────────────────────────
    if (CONFIRM_PATTERNS.some(p => p.test(combined))) return 'REQUIRES_CONFIRMATION';

    // ── 5. HTTP method heuristics ─────────────────────────────────────────
    if (tool.httpMethod && HTTP_METHOD_PERMISSIONS[tool.httpMethod]) {
      return HTTP_METHOD_PERMISSIONS[tool.httpMethod];
    }

    // ── 6. Safe patterns ──────────────────────────────────────────────────
    if (SAFE_PATTERNS.some(p => p.test(name))) return 'SAFE';

    // ── 7. Database reads → safe ──────────────────────────────────────────
    if (tool.source === 'database' && /^(get|list|find|count)/.test(name)) {
      return 'SAFE';
    }

    // ── 8. Database writes → confirm ─────────────────────────────────────
    if (tool.source === 'database') return 'REQUIRES_CONFIRMATION';

    // ── 9. Frontend UI actions default to safe (they're user-initiated) ───
    if (tool.source === 'frontend') return 'SAFE';

    // ── 10. Default: safe ─────────────────────────────────────────────────
    return 'SAFE';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: render a permission badge for CLI output
// ─────────────────────────────────────────────────────────────────────────────

export interface RolePermissionRule {
  tools?: string[];
  patterns?: string[];
  permission: PermissionLevel;
  reason?: string;
}

export interface RolePermissionPolicy {
  defaultRole?: string;
  roles: Record<string, {
    rules?: RolePermissionRule[];
    maxPermission?: PermissionLevel;
  }>;
}

export class RoleBasedPermissionLayer {
  private base = new PermissionLayer();

  constructor(private policy: RolePermissionPolicy) {}

  classifyForRole(
    tools: (ExtractedTool | Workflow)[],
    role = this.policy.defaultRole ?? 'default'
  ): ClassifiedTool[] {
    const classified = this.base.classify(tools);
    const rolePolicy = this.policy.roles[role];
    if (!rolePolicy) return classified;

    return classified.map(tool => {
      const rule = firstMatchingRule(tool, rolePolicy.rules ?? []);
      const permission = clampPermission(
        rule?.permission ?? tool.permission,
        rolePolicy.maxPermission
      );

      return {
        ...tool,
        permission,
        safetyNotes: rule?.reason
          ? `${safetyNote(permission, tool.name)} Role "${role}": ${rule.reason}`
          : safetyNote(permission, tool.name),
      };
    });
  }
}

function firstMatchingRule(
  tool: ExtractedTool,
  rules: RolePermissionRule[]
): RolePermissionRule | undefined {
  return rules.find(rule => {
    if (rule.tools?.includes(tool.name)) return true;
    return (rule.patterns ?? []).some(pattern => new RegExp(pattern, 'i').test(tool.name));
  });
}

function clampPermission(
  permission: PermissionLevel,
  maxPermission?: PermissionLevel
): PermissionLevel {
  if (!maxPermission) return permission;
  return permissionRank(permission) > permissionRank(maxPermission)
    ? maxPermission
    : permission;
}

function permissionRank(permission: PermissionLevel): number {
  switch (permission) {
    case 'BLOCKED': return 0;
    case 'REQUIRES_CONFIRMATION': return 1;
    case 'SAFE': return 2;
    default: return 1;
  }
}

export function permissionBadge(level: PermissionLevel): string {
  switch (level) {
    case 'SAFE':                  return '[SAFE   ]';
    case 'REQUIRES_CONFIRMATION': return '[CONFIRM]';
    case 'BLOCKED':               return '[BLOCKED]';
    default:                      return '[UNKNOWN]';
  }
}
