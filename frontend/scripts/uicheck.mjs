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

// -------------------------------------- card controls survive the grab bands
// The grab bands are live even when invisible, so the thing they must never do
// is swallow a click meant for the card itself.
const reachable = await page.evaluate(() => {
  const out = {};
  for (const [label, selector] of [
    ['title input', '.ticker-node__title'],
    ['refresh button', '.ticker-node__actions .icon-button'],
    ['add-ticker input', '.performance-table__add-input'],
    ['add-ticker button', '.performance-table__add-button'],
    ['first data row', '.performance-table tbody tr td'],
    ['column header', '.performance-table thead th'],
  ]) {
    const target = document.querySelector(selector);
    const rect = target.getBoundingClientRect();
    const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    out[label] = {
      ok: target === topmost || target.contains(topmost) || topmost?.closest(selector) !== null,
      blockedBy: topmost?.className ?? null,
    };
  }
  return out;
});
for (const [label, value] of Object.entries(reachable)) {
  check(`${label} is not covered by a grab band`, value.ok, `topmost=${value.blockedBy}`);
}

await page.locator('.ticker-node__title').first().click();
check(
  'clicking the title focuses it rather than starting a resize',
  await page.evaluate(() => document.activeElement?.className.includes('ticker-node__title')),
);

// ------------------------------------------------------------- resize probes
// Park the pointer on empty canvas: the geometry below has to hold for a card
// nobody is hovering, which is the state a user first meets it in.
await page.mouse.move(1500, 900);
await page.waitForTimeout(250);

const handleGeometry = await page.evaluate(() => {
  const flowNode = document.querySelector('.react-flow__node');
  const nodeRect = flowNode.getBoundingClientRect();
  const out = {};
  for (const element of flowNode.querySelectorAll('.react-flow__resize-control')) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const marker = getComputedStyle(element, '::after');
    out[element.className.replace('react-flow__resize-control ', '')] = {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      // How far the hit area reaches into the card, per axis. Staying under the
      // card's 9px padding is what keeps it clear of the card's own controls.
      insetX: Math.round(Math.min(rect.right - nodeRect.left, nodeRect.right - rect.left)),
      insetY: Math.round(Math.min(rect.bottom - nodeRect.top, nodeRect.bottom - rect.top)),
      visibility: style.visibility,
      pointerEvents: style.pointerEvents,
      markerOpacity: marker.opacity,
    };
  }
  return out;
});
console.log('handle geometry:', JSON.stringify(handleGeometry, null, 2));

const controls = Object.entries(handleGeometry);
check('all eight resize controls are hit-testable', controls.length === 8 &&
  controls.every(([, value]) => value.visibility === 'visible' && value.pointerEvents === 'all'),
  controls.map(([key]) => key).join(' | '));

const lines = controls.filter(([key]) => key.includes('line'));
check(
  'every edge band is at least 14px thick',
  lines.every(([key, value]) => (key.includes('top') || key.includes('bottom') ? value.height : value.width) >= 14),
  lines.map(([key, value]) => `${key}=${value.width}x${value.height}`).join(', '),
);

const knobs = controls.filter(([key]) => key.includes('handle'));
check(
  'every corner knob is at least 20px and overhangs outwards',
  knobs.every(([, value]) => value.width >= 20 && value.height >= 20 && value.insetX <= 9 && value.insetY <= 9),
  knobs.map(([key, value]) => `${key}=${value.width}px in(${value.insetX},${value.insetY})`).join(', '),
);

const grip = handleGeometry['nodrag bottom right handle'];
check('bottom-right grip is visible without hovering', grip !== undefined && grip.markerOpacity === '1', JSON.stringify(grip));

async function nodeRect() {
  return page.evaluate(() => {
    const rect = document.querySelector('.react-flow__node').getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      x: Math.round(rect.x),
      y: Math.round(rect.y),
    };
  });
}

/**
 * Grabs a control at the point of the card border it is meant to control, not at
 * the centre of its (deliberately off-centre) hit box, then drags by `by`.
 */
async function dragControl(selector, grabAt, by) {
  const rect = await nodeRect();
  const start = {
    x: rect.x + rect.width * grabAt.x,
    y: rect.y + rect.height * grabAt.y,
  };
  const hit = await page.evaluate(
    ({ point, expected }) => {
      const element = document.elementFromPoint(point.x, point.y);
      return { actual: element?.className ?? null, matches: element?.matches(expected) ?? false };
    },
    { point: start, expected: selector },
  );
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(start.x + (by.x * step) / 12, start.y + (by.y * step) / 12);
  }
  await page.mouse.up();
  await page.waitForTimeout(120);
  return { hit, after: await nodeRect() };
}

const resizeCases = [
  {
    label: 'bottom-right corner grows the card',
    selector: '.react-flow__resize-control.handle.bottom.right',
    grabAt: { x: 1, y: 1 },
    by: { x: 140, y: 110 },
    expect: (before, after) => after.width >= before.width + 130 && after.height >= before.height + 100,
  },
  {
    label: 'right edge narrows the card',
    selector: '.react-flow__resize-control.line.right',
    grabAt: { x: 1, y: 0.5 },
    by: { x: -120, y: 0 },
    expect: (before, after) => Math.abs(after.width - (before.width - 120)) <= 4,
  },
  {
    label: 'bottom edge shortens the card',
    selector: '.react-flow__resize-control.line.bottom',
    grabAt: { x: 0.5, y: 1 },
    by: { x: 0, y: -70 },
    expect: (before, after) => Math.abs(after.height - (before.height - 70)) <= 4,
  },
  {
    label: 'left edge resizes and keeps the right border still',
    selector: '.react-flow__resize-control.line.left',
    grabAt: { x: 0, y: 0.5 },
    by: { x: 90, y: 0 },
    expect: (before, after) =>
      Math.abs(after.width - (before.width - 90)) <= 4 &&
      Math.abs(after.x + after.width - (before.x + before.width)) <= 4,
  },
  {
    label: 'top-left corner resizes diagonally',
    selector: '.react-flow__resize-control.handle.top.left',
    grabAt: { x: 0, y: 0 },
    by: { x: 60, y: 40 },
    expect: (before, after) =>
      Math.abs(after.width - (before.width - 60)) <= 4 && Math.abs(after.height - (before.height - 40)) <= 4,
  },
];

for (const testCase of resizeCases) {
  const before = await nodeRect();
  const { hit, after } = await dragControl(testCase.selector, testCase.grabAt, testCase.by);
  check(
    testCase.label,
    hit.matches && testCase.expect(before, after),
    `hit=${hit.matches ? 'yes' : `no (${hit.actual})`} ${before.width}x${before.height} -> ${after.width}x${after.height}`,
  );
}

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

// ------------------------------------------------------------ card placement
// Fresh context: this is about where cards land when they are first added, which
// the resizing above has already scrambled on the main page.
const placementPage = await (await browser.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
placementPage.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
await placementPage.goto(BASE, { waitUntil: 'networkidle' });
await placementPage.waitForSelector('.drawer__item', { timeout: 20000 });

const listNames = ['Megacap Tech', 'Semis', 'Banks', 'Energy'];
for (const name of listNames) {
  await placementPage
    .locator('.drawer__item', { hasText: name })
    .getByRole('button', { name: 'Add' })
    .click();
  // No settling pause: adding lists back to back is exactly the case where a
  // card that has not finished loading can be landed on.
}
await placementPage.waitForFunction(
  (count) => document.querySelectorAll('.react-flow__node').length === count,
  listNames.length,
  { timeout: 20000 },
);
await placementPage.waitForFunction(
  () => document.querySelectorAll('.performance-table tbody tr').length >= 30,
  null,
  { timeout: 120000 },
);
await placementPage.waitForTimeout(1500);

const overlaps = await placementPage.evaluate(() => {
  const cards = [...document.querySelectorAll('.react-flow__node')].map((node) => ({
    name: node.querySelector('.ticker-node__title').value,
    rect: node.getBoundingClientRect(),
  }));
  const found = [];
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const a = cards[i].rect;
      const b = cards[j].rect;
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapX > 0 && overlapY > 0) {
        found.push(`${cards[i].name} x ${cards[j].name} (${Math.round(overlapX)}x${Math.round(overlapY)}px)`);
      }
    }
  }
  return { count: cards.length, found };
});
check(
  'four lists added back to back never overlap',
  overlaps.count === 4 && overlaps.found.length === 0,
  overlaps.found.length ? overlaps.found.join('; ') : `${overlaps.count} cards, no overlap`,
);

const noScroll = await placementPage.evaluate(() =>
  [...document.querySelectorAll('.table-wrap')].map((wrap) => ({
    v: wrap.scrollHeight > wrap.clientHeight + 1,
    h: wrap.scrollWidth > wrap.clientWidth + 1,
  })),
);
check(
  'new cards are tall enough to show every row without scrolling',
  noScroll.every((entry) => !entry.v && !entry.h),
  JSON.stringify(noScroll),
);

console.log('\nconsole errors:', consoleErrors.length ? consoleErrors : 'none');
const failed = results.filter((entry) => !entry.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

await browser.close();
process.exit(failed.length === 0 && consoleErrors.length === 0 ? 0 : 1);
