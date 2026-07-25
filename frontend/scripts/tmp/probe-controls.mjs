import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
await page.goto('http://127.0.0.1:5000', { waitUntil: 'networkidle' });
await page.waitForSelector('.drawer__item');
await page.locator('.drawer__item', { hasText: 'Semis' }).getByRole('button', { name: 'Add' }).click();
await page.waitForFunction(() => document.querySelectorAll('.performance-table tbody tr').length > 2, null, { timeout: 60000 });
await page.waitForTimeout(500);

const info = await page.evaluate(() => {
  const node = document.querySelector('.react-flow__node');
  const nodeRect = node.getBoundingClientRect();
  const controls = [...node.querySelectorAll('.react-flow__resize-control')].map((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      cls: el.className.replace('react-flow__resize-control ', ''),
      // offsets relative to the node box: negative = outside
      left: Math.round(r.left - nodeRect.left),
      top: Math.round(r.top - nodeRect.top),
      right: Math.round(r.right - nodeRect.right),
      bottom: Math.round(r.bottom - nodeRect.bottom),
      w: Math.round(r.width),
      h: Math.round(r.height),
      anchor: { left: s.left, top: s.top, right: s.right, bottom: s.bottom },
      translate: s.translate,
      transform: s.transform,
      cursor: s.cursor,
    };
  });
  const shell = document.querySelector('.node-shell');
  return {
    node: { w: Math.round(nodeRect.width), h: Math.round(nodeRect.height) },
    shellPosition: getComputedStyle(shell).position,
    nodePosition: getComputedStyle(node).position,
    cardRadius: getComputedStyle(document.querySelector('.ticker-node')).borderBottomRightRadius,
    cardPadding: getComputedStyle(document.querySelector('.ticker-node')).padding,
    controls,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
