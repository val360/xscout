// Captures review screenshots of the canvas UI in both themes.
//   node scripts/screenshots.mjs [outputDir]
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.XSCOUT_URL ?? 'http://127.0.0.1:5000';
const OUT = process.argv[2] ?? '/tmp/xscout-shots';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1680, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
page.on('console', (message) => {
  if (message.type() === 'error') {
    console.log('console error:', message.text());
  }
});

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${OUT}/${name}.png`);
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.drawer__item', { timeout: 20000 });
await page.waitForTimeout(400);
await shot('01-empty-light');

for (const name of ['Megacap Tech', 'Semis', 'Banks']) {
  await page.locator('.drawer__item', { hasText: name }).getByRole('button', { name: 'Add' }).click();
  await page.waitForTimeout(400);
}
await page.waitForFunction(
  () => document.querySelectorAll('.performance-table tbody tr').length >= 25,
  null,
  { timeout: 120000 },
);
await page.waitForTimeout(1200);
await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
await page.keyboard.press('f');
await page.waitForTimeout(700);
await shot('02-cards-light');

// Selected card: shows the resize handles and grip.
await page.evaluate(() => document.querySelector('.react-flow__node').click());
await page.waitForTimeout(400);
await page.keyboard.press('0');
await page.waitForTimeout(400);
await shot('03-selected-resize-handles');

const card = await page.locator('.ticker-node').first().boundingBox();
await page.mouse.move(card.x + 120, card.y + 180);
await page.waitForTimeout(300);
await page.screenshot({
  path: `${OUT}/04-card-detail-light.png`,
  clip: { x: card.x - 20, y: card.y - 20, width: Math.min(card.width + 40, 1600), height: Math.min(card.height + 40, 900) },
});
console.log(`${OUT}/04-card-detail-light.png`);

// Tight crops of the bottom-right resize grip, idle and hovered.
await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
await page.mouse.move(900, 60);
await page.waitForTimeout(300);
const nodeBox = await page.locator('.react-flow__node').first().boundingBox();
const corner = { x: nodeBox.x + nodeBox.width, y: nodeBox.y + nodeBox.height };
const cornerClip = { x: corner.x - 170, y: corner.y - 110, width: 200, height: 140 };
await page.screenshot({ path: `${OUT}/10-grip-idle.png`, clip: cornerClip });
console.log(`${OUT}/10-grip-idle.png`);
await page.mouse.move(corner.x, corner.y);
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/11-grip-hover.png`, clip: cornerClip });
console.log(`${OUT}/11-grip-hover.png`);

// Dark theme.
await page.locator('.segmented').last().locator('button').nth(2).click();
await page.waitForTimeout(400);
await shot('05-cards-dark');
await page.mouse.move(card.x + 120, card.y + 180);
await page.waitForTimeout(300);
await page.screenshot({
  path: `${OUT}/06-card-detail-dark.png`,
  clip: { x: card.x - 20, y: card.y - 20, width: Math.min(card.width + 40, 1600), height: Math.min(card.height + 40, 900) },
});
console.log(`${OUT}/06-card-detail-dark.png`);

// Create form + search in the drawer.
await page.locator('.drawer__header').getByRole('button', { name: /New/ }).click();
await page.waitForTimeout(300);
await page.screenshot({
  path: `${OUT}/07-drawer-create-dark.png`,
  clip: { x: 0, y: 0, width: 420, height: 1000 },
});
console.log(`${OUT}/07-drawer-create-dark.png`);

await page.locator('.drawer__header').getByRole('button', { name: /New/ }).click();
await page.locator('.drawer__search input').fill('nvda');
await page.waitForTimeout(300);
await page.screenshot({
  path: `${OUT}/08-drawer-search-dark.png`,
  clip: { x: 0, y: 0, width: 420, height: 1000 },
});
console.log(`${OUT}/08-drawer-search-dark.png`);

// Zoomed out overview.
await page.locator('.drawer__search input').fill('');
await page.locator('.segmented').last().locator('button').nth(0).click();
await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
await page.keyboard.press('f');
await page.waitForTimeout(700);
await page.keyboard.press('-');
await page.keyboard.press('-');
await page.waitForTimeout(700);
await shot('09-zoomed-out-light');

await browser.close();
