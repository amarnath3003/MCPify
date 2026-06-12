// ─────────────────────────────────────────────────────────────────────────────
// @mcpify/ai-enhancer
//
// Uses the Claude API to improve:
//   • cryptic or auto-generated tool names  (e.g. "f(q)" → "searchDocumentation")
//   • empty or thin descriptions            (e.g. "" → "Searches internal docs by keyword")
//   • parameter descriptions                (adds clarity for AI agents)
//
// The enhancer batches all tools into a single API call to minimise latency
// and cost.  A retry with exponential back-off handles transient 529s.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import type { ClassifiedTool } from '@mcpify/schema-engine';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface EnhancementRecord {
  originalName:         string;
  improvedName:         string;
  improvedDescription:  string;
  paramDescriptions:    Record<string, string>;
  agentHint:            string;  // one-liner for AI on when to use this tool
}

interface EnhancementResult {
  tools: EnhancementRecord[];
}

// ─────────────────────────────────────────────────────────────────────────────
// AIEnhancer
// ─────────────────────────────────────────────────────────────────────────────

export class AIEnhancer {
  private client: Anthropic;
  private model = 'claude-opus-4-5';

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Enhance a batch of tools.  Returns the same list with improved metadata.
   * Falls back gracefully: if the API call fails, original tools are returned.
   */
  async enhance(tools: ClassifiedTool[]): Promise<ClassifiedTool[]> {
    if (tools.length === 0) return tools;

    // Split into batches of 30 to stay within prompt limits
    const BATCH = 30;
    const results: ClassifiedTool[] = [];

    for (let i = 0; i < tools.length; i += BATCH) {
      const batch = tools.slice(i, i + BATCH);
      const enhanced = await this._enhanceBatch(batch);
      results.push(...enhanced);
    }

    return results;
  }

  private async _enhanceBatch(tools: ClassifiedTool[]): Promise<ClassifiedTool[]> {
    const toolList = tools.map(t => ({
      name:        t.name,
      description: t.description || '',
      params:      t.params.map((p, i) => ({ name: p, type: t.paramTypes[i] || 'unknown' })),
      source:      t.source,
      permission:  t.permission,
    }));

    const prompt = `You are a developer tool that improves AI agent tool metadata.

Given these extracted tools from a software application, provide improved metadata for each.

RULES:
- Keep names camelCase, verb-noun style (e.g. "refundOrder", "getOrdersByStatus")
- Descriptions should be 1-2 sentences, written from an AI agent perspective
- If the original name is already clear and idiomatic, keep it
- "agentHint" is a one-line tip for AI on when to use this vs similar tools
- paramDescriptions maps each param name to a short type + purpose description
- Respond ONLY with valid JSON, no markdown fences, no extra text

Tools:
${JSON.stringify(toolList, null, 2)}

Respond with this exact structure:
{
  "tools": [
    {
      "originalName": "...",
      "improvedName": "...",
      "improvedDescription": "...",
      "agentHint": "...",
      "paramDescriptions": { "paramName": "description", ... }
    }
  ]
}`;

    let responseText = '';
    try {
      responseText = await this._callWithRetry(prompt);
      const parsed: EnhancementResult = JSON.parse(responseText);
      return this._mergeEnhancements(tools, parsed.tools);
    } catch (err) {
      process.stderr.write(
        `[ai-enhancer] Warning: enhancement failed (${(err as Error).message}). Using originals.\n`
      );
      return tools;
    }
  }

  private async _callWithRetry(prompt: string, attempts = 3): Promise<string> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await this.client.messages.create({
          model:      this.model,
          max_tokens: 4096,
          messages:   [{ role: 'user', content: prompt }],
        });

        return response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('');
      } catch (err: any) {
        const isRetryable =
          err?.status === 529 ||  // overloaded
          err?.status === 503 ||  // service unavailable
          err?.status === 429;    // rate limited

        if (isRetryable && attempt < attempts) {
          const delay = Math.pow(2, attempt) * 1000;
          process.stderr.write(`[ai-enhancer] Retrying in ${delay}ms (attempt ${attempt}/${attempts})...\n`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error('All retry attempts exhausted');
  }

  private _mergeEnhancements(
    originals:    ClassifiedTool[],
    enhancements: EnhancementRecord[]
  ): ClassifiedTool[] {
    const map = new Map<string, EnhancementRecord>(
      enhancements.map(e => [e.originalName, e])
    );

    return originals.map(tool => {
      const e = map.get(tool.name);
      if (!e) return tool;

      // Validate the improved name before using it
      const safeName = this._isValidName(e.improvedName) ? e.improvedName : tool.name;
      const safeDesc = e.improvedDescription?.trim() || tool.description;

      return {
        ...tool,
        name:        safeName,
        description: safeDesc,
        // Attach agent hint to safetyNotes if present
        safetyNotes: [
          tool.safetyNotes,
          e.agentHint ? `Hint: ${e.agentHint}` : '',
        ].filter(Boolean).join('  '),
      };
    });
  }

  private _isValidName(name: string): boolean {
    return typeof name === 'string' &&
           name.length > 0 &&
           name.length < 80 &&
           /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lightweight rule-based enhancer  (no API key required)
// ─────────────────────────────────────────────────────────────────────────────
// Used as a fallback when ANTHROPIC_API_KEY is not set.

const VERB_DESCRIPTIONS: Record<string, string> = {
  get:        'Retrieves',
  list:       'Lists all',
  create:     'Creates a new',
  update:     'Updates an existing',
  delete:     'Permanently deletes',
  send:       'Sends',
  submit:     'Submits',
  fetch:      'Fetches',
  find:       'Finds',
  search:     'Searches for',
  filter:     'Filters',
  export:     'Exports',
  import:     'Imports',
  upload:     'Uploads',
  download:   'Downloads',
  cancel:     'Cancels',
  approve:    'Approves',
  reject:     'Rejects',
  process:    'Processes',
  publish:    'Publishes',
  archive:    'Archives',
  restore:    'Restores',
  validate:   'Validates',
  authenticate:'Authenticates',
  register:   'Registers',
  logout:     'Logs out',
  refund:     'Issues a refund for',
  assign:     'Assigns',
  resolve:    'Resolves',
  escalate:   'Escalates',
  notify:     'Sends a notification about',
  invite:     'Invites',
  checkout:   'Processes checkout for',
  duplicate:  'Creates a copy of',
};

/** Generates a basic description from a camelCase tool name */
export function ruleBasedDescription(name: string): string {
  // Split camelCase into words
  const words = name.replace(/([A-Z])/g, ' $1').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const verb = words[0];
  const noun = words.slice(1).join(' ');

  const verbDesc = VERB_DESCRIPTIONS[verb];
  if (verbDesc && noun) {
    return `${verbDesc} ${noun}.`;
  }
  // Fallback: just title-case and add a period
  return words.map((w, i) => i === 0 ? w[0].toUpperCase() + w.slice(1) : w).join(' ') + '.';
}

/** Apply rule-based descriptions to any tools missing one */
export function applyRuleBasedDescriptions(tools: ClassifiedTool[]): ClassifiedTool[] {
  return tools.map(t => ({
    ...t,
    description: t.description || ruleBasedDescription(t.name),
  }));
}
