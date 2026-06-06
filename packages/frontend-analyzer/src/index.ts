// ─────────────────────────────────────────────────────────────────────────────
// @mcpify/frontend-analyzer
//
// Parses React/Next.js JSX/TSX source files using Babel and extracts semantic
// AI actions from button text, form handlers, and event attributes.
//
// Key insight: a <button onClick={checkout}>Checkout</button> reveals INTENT
// not just a function name.  We resolve that intent to a canonical action name
// so the AI understands "checkoutCart()" rather than a raw click handler.
// ─────────────────────────────────────────────────────────────────────────────

import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { glob } from 'glob';
import fs from 'fs/promises';
import path from 'path';
import type { ExtractedTool } from '@mcpify/schema-engine';

// Babel's traverse default export has a quirk in ESM environments
const traverse = (_traverse as any).default ?? _traverse;

// ─────────────────────────────────────────────────────────────────────────────
// Intent dictionary  —  button text / handler name → canonical action name
// ─────────────────────────────────────────────────────────────────────────────

const INTENT_MAP: Array<{ patterns: string[]; action: string; description: string }> = [
  // Commerce
  { patterns: ['checkout', 'check out', 'proceed to checkout'],          action: 'checkoutCart',             description: 'Initiates the cart checkout flow' },
  { patterns: ['add to cart', 'add to bag', 'add item'],                  action: 'addItemToCart',             description: 'Adds an item to the shopping cart' },
  { patterns: ['remove from cart', 'remove item'],                        action: 'removeItemFromCart',        description: 'Removes an item from the cart' },
  { patterns: ['buy now', 'purchase'],                                    action: 'inititatePurchase',         description: 'Triggers an immediate purchase' },
  { patterns: ['pay', 'make payment', 'complete payment'],                action: 'processPayment',            description: 'Processes a payment transaction' },
  { patterns: ['apply coupon', 'apply promo', 'apply discount'],          action: 'applyDiscountCode',         description: 'Applies a coupon or discount code to the cart' },
  { patterns: ['refund', 'request refund'],                               action: 'refundOrder',               description: 'Initiates an order refund' },
  { patterns: ['cancel order', 'cancel subscription'],                    action: 'cancelOrder',               description: 'Cancels an order or subscription' },
  { patterns: ['subscribe', 'start subscription'],                        action: 'createSubscription',        description: 'Creates a recurring subscription' },
  { patterns: ['unsubscribe', 'cancel plan'],                             action: 'cancelSubscription',        description: 'Cancels a subscription plan' },

  // Auth
  { patterns: ['login', 'log in', 'sign in'],                             action: 'authenticateUser',          description: 'Authenticates a user session' },
  { patterns: ['logout', 'log out', 'sign out'],                          action: 'logoutUser',                description: 'Terminates the current user session' },
  { patterns: ['register', 'sign up', 'create account'],                  action: 'registerUser',              description: 'Creates a new user account' },
  { patterns: ['forgot password', 'reset password'],                      action: 'initiatePasswordReset',     description: 'Sends a password reset email' },
  { patterns: ['change password', 'update password'],                     action: 'updatePassword',            description: 'Updates the account password' },
  { patterns: ['verify email', 'confirm email'],                          action: 'verifyEmail',               description: 'Confirms user email ownership' },
  { patterns: ['enable 2fa', 'enable two-factor'],                        action: 'enable2FA',                 description: 'Enables two-factor authentication' },

  // Content / CRUD
  { patterns: ['save', 'save changes', 'apply changes'],                  action: 'saveChanges',               description: 'Persists unsaved changes' },
  { patterns: ['create', 'new', 'add new'],                               action: 'createRecord',              description: 'Creates a new record or entity' },
  { patterns: ['edit', 'update', 'modify'],                               action: 'updateRecord',              description: 'Updates an existing record' },
  { patterns: ['delete', 'remove', 'trash'],                              action: 'deleteRecord',              description: 'Deletes a record permanently' },
  { patterns: ['archive'],                                                 action: 'archiveRecord',             description: 'Archives a record without deletion' },
  { patterns: ['restore', 'unarchive'],                                   action: 'restoreRecord',             description: 'Restores an archived record' },
  { patterns: ['publish', 'go live'],                                     action: 'publishContent',            description: 'Makes content publicly visible' },
  { patterns: ['unpublish', 'take offline'],                              action: 'unpublishContent',          description: 'Hides content from public view' },
  { patterns: ['duplicate', 'clone'],                                     action: 'duplicateRecord',           description: 'Creates a copy of a record' },

  // Communication
  { patterns: ['send', 'send message', 'send email'],                     action: 'sendMessage',               description: 'Sends a message or email' },
  { patterns: ['reply', 'respond'],                                       action: 'replyToMessage',            description: 'Replies to an existing message' },
  { patterns: ['share'],                                                   action: 'shareContent',              description: 'Shares content with others' },
  { patterns: ['invite', 'invite user', 'send invite'],                   action: 'inviteUser',                description: 'Sends an invitation to a user' },
  { patterns: ['submit support ticket', 'contact support', 'get help'],   action: 'createSupportRequest',      description: 'Opens a customer support ticket' },
  { patterns: ['notify', 'send notification'],                            action: 'sendNotification',          description: 'Sends a notification' },

  // Files
  { patterns: ['upload', 'upload file', 'attach'],                        action: 'uploadFile',                description: 'Uploads a file' },
  { patterns: ['download', 'export file'],                                action: 'downloadFile',              description: 'Downloads a file' },
  { patterns: ['import', 'import data'],                                  action: 'importData',                description: 'Imports data from a file' },
  { patterns: ['export', 'export data', 'export csv'],                    action: 'exportData',                description: 'Exports data to a file' },

  // Search / navigation
  { patterns: ['search', 'find', 'look up'],                              action: 'searchItems',               description: 'Searches for matching items' },
  { patterns: ['filter', 'apply filters'],                                action: 'filterItems',               description: 'Filters a list of items' },
  { patterns: ['sort'],                                                    action: 'sortItems',                 description: 'Sorts a list of items' },

  // Admin / approval
  { patterns: ['approve', 'accept', 'confirm'],                           action: 'approveRequest',            description: 'Approves a pending request' },
  { patterns: ['reject', 'decline', 'deny'],                              action: 'rejectRequest',             description: 'Rejects a pending request' },
  { patterns: ['escalate'],                                                action: 'escalateIssue',             description: 'Escalates an issue to a higher tier' },
  { patterns: ['assign', 'reassign'],                                      action: 'assignTask',                description: 'Assigns a task to a team member' },
  { patterns: ['close', 'resolve', 'mark as done'],                       action: 'resolveIssue',              description: 'Marks an issue or task as resolved' },

  // Generic form
  { patterns: ['submit', 'submit form'],                                   action: 'submitForm',                description: 'Submits a form with user input' },
  { patterns: ['cancel', 'go back', 'discard'],                           action: 'cancelOperation',           description: 'Cancels the current operation' },
  { patterns: ['refresh', 'reload'],                                       action: 'refreshData',               description: 'Reloads the current data' },
];

/** Resolve a button label or handler name to a canonical action name */
export function resolveIntent(text: string): { action: string; description: string } | null {
  const lower = text.toLowerCase().trim();
  for (const entry of INTENT_MAP) {
    if (entry.patterns.some(p => lower === p || lower.includes(p))) {
      return { action: entry.action, description: entry.description };
    }
  }
  return null;
}

/** Strip common handler prefixes and return a cleaned camelCase name */
function stripHandlerPrefix(name: string): string {
  return name.replace(/^(handle|on|_on|_handle)([A-Z])/, (_, _p, c) => c.toLowerCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// FrontendAnalyzer
// ─────────────────────────────────────────────────────────────────────────────

export class FrontendAnalyzer {
  constructor(private rootPath: string) {}

  async extract(): Promise<ExtractedTool[]> {
    const actions: ExtractedTool[] = [];

    const files = await glob('**/*.{tsx,jsx}', {
      cwd:    this.rootPath,
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.mcpify/**',
        '**/*.test.*',
        '**/*.spec.*',
        '**/*.stories.*',
      ],
    });

    for (const file of files) {
      const filePath = path.join(this.rootPath, file);
      const code = await fs.readFile(filePath, 'utf-8').catch(() => '');
      if (!code) continue;
      actions.push(...this._parseFile(code, filePath));
    }

    return this._deduplicate(actions);
  }

  private _parseFile(code: string, filePath: string): ExtractedTool[] {
    let ast: any;
    try {
      ast = parse(code, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties'],
      });
    } catch {
      return [];
    }

    const actions: ExtractedTool[] = [];

    traverse(ast, {
      // ── JSX attributes: onClick, onSubmit, onChange, etc. ──────────────────
      JSXAttribute: (nodePath: any) => {
        const attrName = nodePath.node.name?.name;
        if (typeof attrName !== 'string') return;
        const isEventAttr = /^on[A-Z]/.test(attrName);
        if (!isEventAttr) return;

        const value = nodePath.node.value;
        let handlerName: string | null = null;

        if (value?.type === 'JSXExpressionContainer') {
          const expr = value.expression;
          if (expr.type === 'Identifier') {
            handlerName = expr.name;
          } else if (
            expr.type === 'ArrowFunctionExpression' ||
            expr.type === 'FunctionExpression'
          ) {
            // Inline arrow — try to infer from attribute name
            handlerName = attrName === 'onSubmit' ? 'submitForm' : null;
          } else if (expr.type === 'CallExpression' && expr.callee?.name) {
            handlerName = expr.callee.name;
          }
        }

        // Extract button/element text for intent resolution
        const jsxElement = nodePath.parentPath?.parent;
        const buttonText = jsxElement ? this._extractJSXText(jsxElement) : null;

        // Resolve intent: button text takes precedence over handler name
        let action: string | null = null;
        let description = '';

        if (buttonText) {
          const resolved = resolveIntent(buttonText);
          if (resolved) {
            action = resolved.action;
            description = resolved.description;
          }
        }

        if (!action && handlerName) {
          const cleaned = stripHandlerPrefix(handlerName);
          const resolved = resolveIntent(cleaned);
          if (resolved) {
            action = resolved.action;
            description = resolved.description;
          } else {
            action = cleaned;
            description = `UI action triggered by "${buttonText ?? handlerName}"`;
          }
        }

        if (!action) return;

        actions.push({
          name:            action,
          source:          'frontend',
          description,
          params:          [],
          paramTypes:      [],
          returnType:      'void',
          filePath,
          permission:      'UNKNOWN',
          isAsync:         false,
          originalHandler: handlerName ?? undefined,
        });
      },

      // ── <form> elements ────────────────────────────────────────────────────
      JSXOpeningElement: (nodePath: any) => {
        const elName = nodePath.node.name;
        const tagName = elName?.name ?? elName?.property?.name;
        if (tagName === 'form') {
          // Look for an explicit action prop
          const actionAttr = nodePath.node.attributes?.find(
            (a: any) => a.name?.name === 'action'
          );
          const formAction = actionAttr?.value?.value ?? null;
          const resolved = formAction ? resolveIntent(formAction) : null;

          actions.push({
            name:        resolved?.action ?? 'submitForm',
            source:      'frontend',
            description: resolved?.description ?? 'Submits a form with user-entered data',
            params:      [],
            paramTypes:  [],
            returnType:  'void',
            filePath,
            permission:  'UNKNOWN',
            isAsync:     false,
          });
        }
      },
    });

    return actions;
  }

  /** Walk JSX children and collect all string literals */
  private _extractJSXText(jsxElement: any): string | null {
    if (!jsxElement?.children) return null;
    const texts: string[] = [];

    for (const child of jsxElement.children) {
      if (child.type === 'JSXText') {
        const t = child.value.trim();
        if (t) texts.push(t);
      } else if (
        child.type === 'JSXExpressionContainer' &&
        child.expression?.type === 'StringLiteral'
      ) {
        texts.push(child.expression.value);
      }
    }

    return texts.length > 0 ? texts.join(' ').toLowerCase() : null;
  }

  private _deduplicate(tools: ExtractedTool[]): ExtractedTool[] {
    const seen = new Set<string>();
    return tools.filter(t => {
      if (seen.has(t.name)) return false;
      seen.add(t.name);
      return true;
    });
  }
}
