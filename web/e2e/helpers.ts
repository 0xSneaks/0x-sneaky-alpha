import { expect, type Page } from '@playwright/test';

export const MOCK = 'http://127.0.0.1:4174/v1';

/** Skips the intro and runs onboarding with the local mock provider. */
export async function onboardWithMock(page: Page, name = 'Neo') {
  await page.goto('./');
  await page.getByTestId('intro').click();
  await page.getByTestId('ob-start').click();
  await page.getByTestId('ob-name').fill(name);
  await page.getByTestId('ob-name-next').click();
  await page.getByTestId('ob-provider-custom').click();
  await page.getByTestId('ob-url').fill(MOCK);
  await page.getByTestId('ob-key').fill('mock-key-123456');
  await page.getByTestId('ob-key-next').click();
  await page.getByRole('button', { name: 'mock-1' }).click();
  await page.getByTestId('ob-model-next').click();
  await page.getByTestId('ob-finish').click();
  await expect(page.getByTestId('model-chip')).toHaveText('mock-1');
}

export async function sendMessage(page: Page, text: string) {
  await page.getByTestId('composer').fill(text);
  await page.getByTestId('send').click();
}

export const assistants = (page: Page) => page.getByTestId('msg-assistant');
