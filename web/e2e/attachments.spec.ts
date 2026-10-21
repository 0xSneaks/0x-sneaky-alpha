import { expect, test } from '@playwright/test';
import { assistants, onboardWithMock } from './helpers';

// 2x2 red PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

test('attach an image and a text file; both reach the provider and survive reload', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  await onboardWithMock(page);

  await page.getByTestId('attach-input').setInputFiles([
    { name: 'dot.png', mimeType: 'image/png', buffer: PNG },
    { name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('remember the neon') },
  ]);
  await expect(page.getByTestId('composer-attachments').getByTestId('attachment-chip')).toHaveCount(2);
  await page.getByTestId('composer').fill('what is this');
  await page.getByTestId('send').click();

  const reply = assistants(page).first();
  await expect(reply).toHaveAttribute('data-status', 'done');
  // The mock echoes the text it received (with the text file appended) and counts image parts.
  await expect(reply).toContainText('what is this');
  await expect(reply).toContainText('--- File: notes.md ---');
  await expect(reply).toContainText('remember the neon [images:1 files:0]');
  await expect(page.getByTestId('msg-user').first().getByTestId('attachment-chip')).toHaveCount(2);
  await expect(page.getByTestId('msg-user').first().locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);

  await page.reload();
  await page.getByTestId('intro').click();
  await page.getByTestId('open-drawer').click();
  await page.getByTestId('conv-item').first().click();
  await expect(page.getByTestId('msg-user').first().getByTestId('attachment-chip')).toHaveCount(2);
});
