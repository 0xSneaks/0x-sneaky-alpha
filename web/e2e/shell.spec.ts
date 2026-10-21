import { expect, test } from '@playwright/test';

test('PWA shell: iOS meta tags, manifest, icon, offline reload', async ({ page, context, request }) => {
  await page.goto('./');
  // iOS install metadata.
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'black-translucent');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
  const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect((await request.get(new URL(touchIcon!, page.url()).href)).status()).toBe(200);
  const manifest = await (await request.get('./manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);

  // Service worker takes control, then the shell reloads with the network cut.
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('intro').click();
  await expect(page.getByTestId('ob-start')).toBeVisible();
  await context.setOffline(false);
});

test('standalone launch shows the app, not the install hint', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  await page.goto('./');
  await expect(page.locator('.app-root')).toHaveAttribute('data-standalone', 'true');
  await expect(page.getByTestId('install-hint')).toHaveCount(0);
});

test('in Safari (not installed) the install hint shows', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('intro').click();
  await expect(page.locator('.app-root')).toHaveAttribute('data-standalone', 'false');
  await expect(page.getByTestId('install-hint')).toBeVisible();
});
