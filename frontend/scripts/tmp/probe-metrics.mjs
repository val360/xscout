import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
await page.goto('http://127.0.0.1:5000', { waitUntil: 'networkidle' });
await page.waitForSelector('.drawer__item');
for (const name of ['Banks', 'Semis']) {
  await page.locator('.drawer__item', { hasText: name }).getByRole('button', { name: 'Add' }).click();
  await page.waitForTimeout(400);
}
await page.waitForFunction(() => document.querySelectorAll('.performance-table tbody tr').length >= 19, null, { timeout: 60000 });
await page.waitForTimeout(1200);

const info = await page.evaluate(() => {
  return [...document.querySelectorAll('.react-flow__node')].map((node) => {
    const card = node.querySelector('.ticker-node');
    const wrap = node.querySelector('.table-wrap');
    const rows = node.querySelectorAll('.performance-table tbody tr');
    const head = node.querySelector('.performance-table thead');
    const foot = node.querySelector('.performance-table tfoot');
    const r = (el) => (el ? Math.round(el.getBoundingClientRect().height) : null);
    return {
      name: node.querySelector('.ticker-node__title').value,
      nodeH: r(node),
      cardH: r(card),
      wrapH: r(wrap),
      rowCount: rows.length,
      rowH: r(rows[0]),
      headH: r(head),
      footH: r(foot),
      header: r(node.querySelector('.ticker-node__header')),
      meta: r(node.querySelector('.ticker-node__meta')),
      // chrome = everything that is not table body rows
      chrome: r(node) - rows.length * r(rows[0]),
      scrolls: wrap.scrollHeight > wrap.clientHeight,
    };
  });
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
