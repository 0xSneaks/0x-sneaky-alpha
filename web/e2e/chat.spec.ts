import { expect, test } from '@playwright/test';
import { assistants, onboardWithMock, sendMessage } from './helpers';

test('onboarding, greeting, streamed chat, stop, and data survives reload', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  await onboardWithMock(page);
  await expect(page.getByTestId('greeting')).toHaveText(/^(Good (morning|afternoon|evening)|Hey), Neo$/);

  // Streamed reply: text grows over several chunks.
  await sendMessage(page, 'hello there friend');
  const first = assistants(page).first();
  await expect(page.getByTestId('stop')).toBeVisible();
  await expect(first).toHaveAttribute('data-status', 'done');
  await expect(first).toContainText('Echo: hello there friend');

  // Stop mid-stream keeps the partial text.
  await sendMessage(page, 'slow please');
  const second = assistants(page).nth(1);
  await expect(second).toContainText('w3');
  await page.getByTestId('stop').click();
  await expect(second).toHaveAttribute('data-status', 'stopped');
  await expect(second).toContainText('Stopped');
  await expect(second).not.toContainText('w69');

  // Reload: chat, messages and settings come back from IndexedDB.
  await page.reload();
  await page.getByTestId('intro').click();
  await page.getByTestId('open-drawer').click();
  await page.getByTestId('conv-item').first().click();
  await expect(assistants(page).first()).toContainText('Echo: hello there friend');
  await expect(assistants(page).nth(1)).toHaveAttribute('data-status', 'stopped');
  await expect(page.getByTestId('model-chip')).toHaveText('mock-1');
});
