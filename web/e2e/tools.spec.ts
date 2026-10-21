import { expect, test } from '@playwright/test';
import { assistants, onboardWithMock, sendMessage } from './helpers';

test('memory tool call round-trips and MCP server tools work', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  await onboardWithMock(page);

  // The model calls update_active_memory, the app runs it, and the model continues.
  await sendMessage(page, 'remember I like neon');
  const reply = assistants(page).first();
  await expect(reply).toHaveAttribute('data-status', 'done');
  await expect(reply.getByTestId('tool-block')).toContainText('Called update_active_memory');
  await expect(reply).toContainText('Tool said: Active memory updated');

  // Add a remote MCP server (Streamable HTTP) and check it in Settings.
  await page.getByTestId('open-drawer').click();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('active-memory')).toHaveValue('I like neon');
  await page.getByTestId('mcp-add').click();
  await page.getByTestId('mcp-name').fill('Mock');
  await page.getByTestId('mcp-url').fill('http://127.0.0.1:4174/mcp');
  await page.getByTestId('mcp-headers').fill('Authorization: Bearer mcp-secret-123');
  await page.getByTestId('mcp-save').click();
  await page.getByTestId('mcp-test').click();
  await expect(page.getByTestId('mcp-status')).toContainText('Connected · 1 tools: echo');
  await page.getByTestId('settings-back').click();

  await sendMessage(page, 'use mcp please');
  const second = assistants(page).nth(1);
  await expect(second).toHaveAttribute('data-status', 'done');
  await expect(second.getByTestId('tool-block')).toContainText('Called mcp_Mock__echo');
  await expect(second).toContainText('Tool said: mcp echo: from model');
});
