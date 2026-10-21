import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { assistants, onboardWithMock, sendMessage } from './helpers';

test('export chats to JSON, delete them, import them back', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { get: () => true });
    Object.defineProperty(navigator, 'canShare', { get: () => undefined });
  });
  await onboardWithMock(page);
  await sendMessage(page, 'keep me safe');
  await expect(assistants(page).first()).toHaveAttribute('data-status', 'done');

  await page.getByTestId('open-drawer').click();
  await page.getByTestId('open-settings').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('export').click();
  const file = await (await download).path();
  const json = readFileSync(file, 'utf8');
  expect(JSON.parse(json).format).toBe('0x-sneaky-alpha-chats');
  expect(json).not.toContain('mock-key-123456');

  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete all chats' }).click();
  await expect(page.getByTestId('toast')).toHaveText('All chats deleted');
  await page.getByTestId('import-file').setInputFiles({ name: 'chats.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await expect(page.getByTestId('toast')).toHaveText('Imported 1 chat');
  await page.getByTestId('settings-back').click();
  await page.getByTestId('open-drawer').click();
  await page.getByTestId('conv-item').first().click();
  await expect(assistants(page).first()).toContainText('Echo: keep me safe');
});
