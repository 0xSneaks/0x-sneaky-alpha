import { expect, test } from '@playwright/test';
import { assistants, onboardWithMock, sendMessage } from './helpers';

test('edit and regenerate create branches; switching keeps both; branches survive reload', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  await onboardWithMock(page);

  await sendMessage(page, 'first question');
  await expect(assistants(page).first()).toHaveAttribute('data-status', 'done');
  await sendMessage(page, 'follow up');
  await expect(assistants(page).nth(1)).toContainText('Echo: follow up');
  await expect(assistants(page).nth(1)).toHaveAttribute('data-status', 'done');

  // Edit the first user message: a sibling branch with its own reply.
  const firstUser = page.getByTestId('msg-user').first();
  await firstUser.getByTestId('edit').click();
  await firstUser.getByTestId('edit-input').fill('edited question');
  await firstUser.getByTestId('edit-save').click();
  await expect(assistants(page)).toHaveCount(1);
  await expect(assistants(page).first()).toContainText('Echo: edited question');
  await expect(assistants(page).first()).toHaveAttribute('data-status', 'done');
  await expect(page.getByTestId('msg-user').first().getByTestId('branch-count')).toHaveText('2/2');

  // Switch back: the original branch, including the follow-up, is intact.
  await page.getByTestId('msg-user').first().getByRole('button', { name: 'Previous branch' }).click();
  await expect(page.getByTestId('msg-user').first().getByTestId('branch-count')).toHaveText('1/2');
  await expect(assistants(page)).toHaveCount(2);
  await expect(assistants(page).nth(1)).toContainText('Echo: follow up');

  // Regenerate the last reply: a second assistant branch.
  await assistants(page).nth(1).getByTestId('regenerate').click();
  await expect(assistants(page).nth(1)).toHaveAttribute('data-status', 'done');
  await expect(assistants(page).nth(1).getByTestId('branch-count')).toHaveText('2/2');

  // Reload: every branch and the current selection persist.
  await page.reload();
  await page.getByTestId('intro').click();
  await page.getByTestId('open-drawer').click();
  await page.getByTestId('conv-item').first().click();
  await expect(page.getByTestId('msg-user').first().getByTestId('branch-count')).toHaveText('1/2');
  await expect(assistants(page).nth(1).getByTestId('branch-count')).toHaveText('2/2');
  await page.getByTestId('msg-user').first().getByRole('button', { name: 'Next branch' }).click();
  await expect(assistants(page).first()).toContainText('Echo: edited question');
});
