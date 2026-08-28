import { expect, test } from '@playwright/test';

test('navigate from Watts back to Canvas', async ({ page }) => {
  await page.goto('/#watts');
  await expect(page.getByRole('main', { name: 'Watts Into Thoughts dashboard' })).toBeVisible();

  await page.getByRole('tab', { name: 'Canvas' }).click();

  await expect(page.getByLabel('Ticker list canvas')).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('main', { name: 'Watts Into Thoughts dashboard' })).not.toBeVisible();
});

test('browser back from Watts returns to Canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Ticker list canvas')).toBeVisible();

  await page.getByRole('tab', { name: 'Watts' }).click();
  await expect(page.getByRole('main', { name: 'Watts Into Thoughts dashboard' })).toBeVisible();
  await expect(page).toHaveURL(/#watts$/);

  await page.goBack();
  await expect(page.getByLabel('Ticker list canvas')).toBeVisible({ timeout: 5000 });
});
