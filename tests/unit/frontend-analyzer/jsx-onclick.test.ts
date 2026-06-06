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

test('extracts semantic actions from React JSX event handlers', async () => {
  const root = await makeProject({
    'src/CartPage.tsx': `
export function CartPage() {
  return (
    <section>
      <button onClick={handleCheckout}>Checkout</button>
      <button onClick={() => refundOrder(order.id)}>Request refund</button>
      <form onSubmit={handleSaveChanges}>
        <input name="email" type="email" />
        <input name="quantity" type="number" />
        <button type="submit">Save Changes</button>
      </form>
    </section>
  );
}
`,
  });

  const tools = await new FrontendAnalyzer(root).extract();
  const byName = new Map(tools.map(tool => [tool.name, tool]));

  assert.equal(byName.get('checkoutCart')?.originalHandler, 'handleCheckout');
  assert.equal(byName.get('refundOrder')?.originalHandler, 'refundOrder');
  assert.deepEqual(byName.get('saveChanges')?.params, ['email', 'quantity']);
  assert.deepEqual(byName.get('saveChanges')?.paramTypes, ['string', 'number']);
});

async function makeProject(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpify-react-'));
  tempDirs.push(root);

  for (const [relativePath, source] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, source, 'utf8');
  }

  return root;
}
