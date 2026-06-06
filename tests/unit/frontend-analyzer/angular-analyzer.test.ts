import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { FrontendAnalyzer } from '../../../packages/frontend-analyzer/dist/index.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))
  );
});

test('extracts Angular template event bindings and form fields', async () => {
  const root = await makeProject({
    'src/admin.component.html': `
<button (click)="approveRequest(request.id)">Approve</button>
<form (ngSubmit)="submitSupportTicket()">
  <input formControlName="email" type="email" />
  <input formControlName="urgent" type="checkbox" />
  <button type="submit">Submit Support Ticket</button>
</form>
`,
  });

  const tools = await new FrontendAnalyzer(root).extract();
  const byName = new Map(tools.map(tool => [tool.name, tool]));

  assert.equal(byName.get('approveRequest')?.originalHandler, 'approveRequest');
  assert.equal(byName.get('createSupportRequest')?.originalHandler, 'submitSupportTicket');
  assert.deepEqual(byName.get('createSupportRequest')?.params, ['email', 'urgent']);
  assert.deepEqual(byName.get('createSupportRequest')?.paramTypes, ['string', 'boolean']);
});

test('extracts Angular inline component templates', async () => {
  const root = await makeProject({
    'src/settings.component.ts': `
import { Component } from '@angular/core';

@Component({
  selector: 'app-settings',
  template: \`
    <button (click)="refreshData()">Refresh</button>
  \`,
})
export class SettingsComponent {}
`,
  });

  const tools = await new FrontendAnalyzer(root).extract();

  assert.ok(tools.some(tool => tool.name === 'refreshData' && tool.originalHandler === 'refreshData'));
});

async function makeProject(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpify-angular-'));
  tempDirs.push(root);

  for (const [relativePath, source] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, source, 'utf8');
  }

  return root;
}
