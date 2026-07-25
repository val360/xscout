// Ad-hoc UI probe used while iterating on the canvas redesign. Not part of the
// build: run it against a live server with `node scripts/uicheck.mjs`.
import { chromium } from 'playwright';

const BASE = process.env.XSCOUT_URL ?? 'http://127.0.0.1:5000';
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text());
  }
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.drawer__item', { timeout: 20000 });

// ---------------------------------------------------------------- add a card
await page.locator('.drawer__item', { hasText: 'Megacap Tech' }).getByRole('button', { name: 'Add' }).click();
await page.waitForSelector('.ticker-node', { timeout: 30000 });
await page.waitForFunction(
  () => document.querySelectorAll('.performance-table tbody tr').length > 1,
  null,
  { timeout: 60000 },
);
check('card renders with performance rows', true, `${await page.locator('.performance-table tbody tr').count()} rows`);

// ------------------------------------------------------- table fits the card
const fit = await page.evaluate(() => {
  const wrap = document.querySelector('.table-wrap');
  const cells = [...document.querySelectorAll('.performance-table thead th')].map((th) =>
    Math.round(th.getBoundingClientRect().width),
  );
  return { scrollWidth: wrap.scrollWidth, clientWidth: wrap.clientWidth, cells };
});
console.log('header cell widths:', JSON.stringify(fit.cells));
check(
  'all table columns visible at default card width',
  fit.scrollWidth <= fit.clientWidth + 1,
  `scrollWidth=${fit.scrollWidth} clientWidth=${fit.clientWidth}`,
);

// ------------------------------------------------------------- resize probes
const node = page.locator('.react-flow__node').first();
await node.hover();

const handleGeometry = await page.evaluate(() => {
  const out = {};
  for (const selector of [
    '.react-flow__resize-control.handle.bottom.right',
    '.react-flow__resize-control.line.right',
    '.react-flow__resize-control.line.bottom',
  ]) {
    const element = document.querySelector(selector);
    if (!element) {
      out[selector] = null;
      continue;
    }
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    out[selector] = {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      display: style.display,
    };
  }
  return out;
});
console.log('handle geometry:', JSON.stringify(handleGeometry, null, 2));

const grip = handleGeometry['.react-flow__resize-control.handle.bottom.right'];
check('bottom-right grip exists and is visible', grip !== null && grip.opacity === '1', JSON.stringify(grip));
const rightLine = handleGeometry['.react-flow__resize-control.line.right'];
check('right edge hit area is at least 12px wide', rightLine !== null && rightLine.width >= 12, JSON.stringify(rightLine));

async function boxOf(selector) {
  return page.locator(selector).first().boundingBox();
}

async function nodeSize() {
  return page.evaluate(() => {
    const rect = document.querySelector('.react-flow__node').getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  });
}

// Drag the corner grip.
const before = await nodeSize();
let handleBox = await boxOf('.react-flow__resize-control.handle.bottom.right');
await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
await page.mouse.down();
for (let step = 1; step <= 12; step += 1) {
  await page.mouse.move(
    handleBox.x + handleBox.width / 2 + (150 * step) / 12,
    handleBox.y + handleBox.height / 2 + (120 * step) / 12,
  );
}
await page.mouse.up();
const afterCorner = await nodeSize();
check(
  'corner grip resizes the card',
  afterCorner.width > before.width + 100 && afterCorner.height > before.height + 90,
  `${before.width}x${before.height} -> ${afterCorner.width}x${afterCorner.height}`,
);

// Drag the right edge.
const edgeBox = await boxOf('.react-flow__resize-control.line.right');
await page.mouse.move(edgeBox.x + edgeBox.width / 2, edgeBox.y + edgeBox.height / 2);
await page.mouse.down();
for (let step = 1; step <= 10; step += 1) {
  await page.mouse.move(
    edgeBox.x + edgeBox.width / 2 - (100 * step) / 10,
    edgeBox.y + edgeBox.height / 2,
  );
}
await page.mouse.up();
const afterEdge = await nodeSize();
check(
  'right edge resizes the card',
  afterEdge.width < afterCorner.width - 80,
  `${afterCorner.width} -> ${afterEdge.width}`,
);

// -------------------------------------------------------------- drag to drop
const drawerItem = page.locator('.drawer__item', { hasText: 'Energy' });
const itemBox = await drawerItem.boundingBox();
const canvasBox = await page.locator('.canvas').boundingBox();
const dropX = canvasBox.x + canvasBox.width * 0.62;
const dropY = canvasBox.y + canvasBox.height * 0.7;

await page.mouse.move(itemBox.x + itemBox.width / 2, itemBox.y + itemBox.height / 2);
await page.mouse.down();
await page.mouse.move(itemBox.x + itemBox.width / 2 + 20, itemBox.y + itemBox.height / 2 + 10);
for (let step = 1; step <= 10; step += 1) {
  await page.mouse.move(
    itemBox.x + (dropX - itemBox.x) * (step / 10),
    itemBox.y + (dropY - itemBox.y) * (step / 10),
  );
}
const dropTargetActive = await page.locator('.canvas.is-drop-target').count();
await page.mouse.up();
await page.waitForTimeout(1500);
const energyCard = await page.locator('.ticker-node__title[value="Energy"]').count();
const titles = await page.locator('.ticker-node__title').evaluateAll((els) => els.map((el) => el.value));
check('drop highlight appears while dragging a list', dropTargetActive === 1, `matches=${dropTargetActive}`);
check('dropping a list creates a card', titles.includes('Energy'), `titles=${JSON.stringify(titles)}`);
void energyCard;

// ---------------------------------------------------- persistence is debounced
const writeCount = await page.evaluate(async () => {
  const original = Storage.prototype.setItem;
  let calls = 0;
  Storage.prototype.setItem = function (...args) {
    if (args[0] === 'xscout.canvas.v2') {
      calls += 1;
    }
    return original.apply(this, args);
  };
  const node = document.querySelector('.react-flow__node');
  const rect = node.getBoundingClientRect();
  const start = { x: rect.left + rect.width / 2, y: rect.top + 12 };
  node.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, clientX: start.x, clientY: start.y, button: 0, isPrimary: true, pointerId: 1 }),
  );
  for (let step = 0; step < 40; step += 1) {
    window.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: start.x + step * 3, clientY: start.y + step * 2, pointerId: 1, isPrimary: true }),
    );
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, isPrimary: true }));
  await new Promise((resolve) => setTimeout(resolve, 900));
  Storage.prototype.setItem = original;
  return calls;
});
check('canvas writes are debounced during a 40-frame drag', writeCount <= 3, `setItem calls=${writeCount}`);

// ------------------------------------------------------------------- theming
for (const [label, index] of [['light', 0], ['dark', 2]]) {
  await page.locator('.segmented').last().locator('button').nth(index).click();
  await page.waitForTimeout(200);
  const applied = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    canvas: getComputedStyle(document.querySelector('.react-flow')).backgroundColor,
    node: getComputedStyle(document.querySelector('.ticker-node')).backgroundColor,
    text: getComputedStyle(document.querySelector('.ticker-node')).color,
  }));
  check(`theme switch to ${label}`, applied.theme === label, JSON.stringify(applied));
}

// ------------------------------------------------------------ modifier zoom
await page.locator('.segmented').last().locator('button').nth(0).click();
const zoomBefore = await page.locator('.canvas-controls__zoom').innerText();
const tableBox = await page.locator('.table-wrap').first().boundingBox();
await page.mouse.move(tableBox.x + tableBox.width / 2, tableBox.y + tableBox.height / 2);
await page.keyboard.down('Control');
await page.mouse.wheel(0, -240);
await page.keyboard.up('Control');
await page.waitForTimeout(300);
const zoomAfter = await page.locator('.canvas-controls__zoom').innerText();
check('ctrl+wheel over a table zooms the canvas', zoomBefore !== zoomAfter, `${zoomBefore} -> ${zoomAfter}`);

// ------------------------------------------------------- keyboard shortcuts
await page.locator('.react-flow__pane').click({ position: { x: 30, y: 30 } });
const zoomPreFit = await page.locator('.canvas-controls__zoom').innerText();
await page.keyboard.press('f');
await page.waitForTimeout(600);
const zoomPostFit = await page.locator('.canvas-controls__zoom').innerText();
check('pressing F fits the view', zoomPreFit !== zoomPostFit, `${zoomPreFit} -> ${zoomPostFit}`);

console.log('\nconsole errors:', consoleErrors.length ? consoleErrors : 'none');
const failed = results.filter((entry) => !entry.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

await browser.close();
process.exit(failed.length === 0 && consoleErrors.length === 0 ? 0 : 1);
