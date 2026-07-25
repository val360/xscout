// Reports the fixed chrome height and per-row height of a ticker card against a
// running server. These two numbers back NODE_CHROME_HEIGHT and NODE_ROW_HEIGHT
// in src/canvas/constants.ts, which is how a new card's height is derived from
// its ticker count. Re-run this after changing the card's header, timestamp,
// table header or add-ticker footer.
//
//   node scripts/measure-card.mjs
import { chromium } from 'playwright';

const BASE = process.env.XSCOUT_URL ?? 'http://127.0.0.1:5000';
const LISTS = ['Banks', 'Semis'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.drawer__item', { timeout: 20000 });

for (const name of LISTS) {
  await page.locator('.drawer__item', { hasText: name }).getByRole('button', { name: 'Add' }).click();
  await page.waitForTimeout(400);
}
await page.waitForFunction(
  (count) => document.querySelectorAll('.react-flow__node').length === count,
  LISTS.length,
  { timeout: 20000 },
);
await page.waitForFunction(
  () => document.querySelectorAll('.performance-table tbody tr').length >= 19,
  null,
  { timeout: 120000 },
);
await page.waitForTimeout(1200);

// Measure against the natural content height rather than the height the app
// assigned, otherwise this just reads back the constants it is meant to check.
const cards = await page.evaluate(() => {
  const height = (element) => (element ? element.getBoundingClientRect().height : 0);
  return [...document.querySelectorAll('.react-flow__node')].map((node) => {
    const card = node.querySelector('.ticker-node');
    const wrap = node.querySelector('.table-wrap');
    const rows = node.querySelectorAll('.performance-table tbody tr');
    const rowHeight = height(rows[0]);
    const naturalHeight =
      height(card) + Math.max(0, wrap.scrollHeight - wrap.clientHeight);
    return {
      name: node.querySelector('.ticker-node__title').value,
      rowCount: rows.length,
      rowHeight: Math.round(rowHeight),
      naturalHeight: Math.round(naturalHeight),
      chromeHeight: Math.round(naturalHeight - rows.length * rowHeight),
    };
  });
});

for (const card of cards) {
  console.log(
    `${card.name.padEnd(14)} rows=${String(card.rowCount).padStart(2)} ` +
      `rowHeight=${card.rowHeight} naturalHeight=${card.naturalHeight} chrome=${card.chromeHeight}`,
  );
}

const chrome = new Set(cards.map((card) => card.chromeHeight));
const rowHeights = new Set(cards.map((card) => card.rowHeight));
console.log(`\nNODE_CHROME_HEIGHT = ${[...chrome].join(' or ')}`);
console.log(`NODE_ROW_HEIGHT    = ${[...rowHeights].join(' or ')}`);
if (chrome.size > 1 || rowHeights.size > 1) {
  console.log('\nCards disagree — the height model no longer holds for every card.');
}

await browser.close();
process.exit(chrome.size === 1 && rowHeights.size === 1 ? 0 : 1);
