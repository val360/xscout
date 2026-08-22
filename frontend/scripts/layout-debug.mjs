// Temporary hypothesis probe for persisted React Flow geometry.
// Run from frontend/ with: node scripts/layout-debug.mjs
import { appendFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.XSCOUT_URL ?? 'http://127.0.0.1:4173';
const LOG_PATH = '/opt/cursor/logs/debug.log';
const CANVAS_KEY = 'xscout.canvas.v2';
const PREFS_KEY = 'xscout.prefs.v1';

const lists = [
  { id: 'list-a', name: 'Megacap Tech', tickers: ['AAPL', 'MSFT'] },
  { id: 'list-b', name: 'Semiconductors', tickers: ['NVDA', 'AMD'] },
];

function node(id, listId, x, y, style) {
  return {
    id,
    type: 'tickerList',
    position: { x, y },
    ...(style === undefined ? {} : { style }),
    data: {
      listId,
      name: '',
      tickers: [],
      rows: [],
      errors: [],
      status: 'idle',
    },
  };
}

const portableNodes = [
  node('node-a', 'list-a', 0, 0, { width: 840, height: 320 }),
  node('node-b', 'list-b', 868, 0, { width: 840, height: 320 }),
];

const scenarios = [
  {
    name: 'wide-source',
    screen: { width: 2400, height: 1400 },
    canvas: { nodes: portableNodes, edges: [], viewport: { x: 1100, y: 250, zoom: 1 } },
  },
  {
    name: 'small-restored-viewport',
    screen: { width: 1024, height: 700 },
    canvas: { nodes: portableNodes, edges: [], viewport: { x: 1100, y: 250, zoom: 1 } },
    screenshot: '/opt/cursor/artifacts/layout_debug_small_offscreen.png',
  },
  {
    name: 'missing-width-upgrade',
    screen: { width: 1600, height: 900 },
    canvas: {
      nodes: [
        node('node-a', 'list-a', 0, 0, { height: 320 }),
        node('node-b', 'list-b', 600, 0, { height: 320 }),
      ],
      edges: [],
      viewport: { x: 40, y: 160, zoom: 1 },
    },
    screenshot: '/opt/cursor/artifacts/layout_debug_missing_size_overlap.png',
  },
  {
    name: 'stored-collision',
    screen: { width: 1600, height: 900 },
    canvas: {
      nodes: [
        node('node-a', 'list-a', 0, 0, { width: 840, height: 320 }),
        node('node-b', 'list-b', 500, 0, { width: 840, height: 320 }),
      ],
      edges: [],
      viewport: { x: 40, y: 160, zoom: 1 },
    },
  },
];

function agentLog(hypothesisId, location, message, data) {
  appendFileSync(
    LOG_PATH,
    `${JSON.stringify({ hypothesisId, location, message, data, timestamp: Date.now() })}\n`,
  );
}

async function inspectLayout(page) {
  return page.evaluate((key) => {
    const flow = document.querySelector('.react-flow');
    const viewport = document.querySelector('.react-flow__viewport');
    const flowRect = flow.getBoundingClientRect();
    const transform = new DOMMatrixReadOnly(getComputedStyle(viewport).transform);
    const nodes = [...document.querySelectorAll('.react-flow__node')].map((element) => {
      const rect = element.getBoundingClientRect();
      const intersectionWidth = Math.max(
        0,
        Math.min(rect.right, flowRect.right) - Math.max(rect.left, flowRect.left),
      );
      const intersectionHeight = Math.max(
        0,
        Math.min(rect.bottom, flowRect.bottom) - Math.max(rect.top, flowRect.top),
      );
      return {
        id: element.dataset.id,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visible: intersectionWidth > 0 && intersectionHeight > 0,
      };
    });
    const overlaps = [];
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const left = nodes[leftIndex];
        const right = nodes[rightIndex];
        const overlapX =
          Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
        const overlapY =
          Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
        if (overlapX > 0 && overlapY > 0) {
          overlaps.push({
            pair: `${left.id}/${right.id}`,
            width: Math.round(overlapX),
            height: Math.round(overlapY),
          });
        }
      }
    }
    return {
      canvas: {
        x: Math.round(flowRect.x),
        y: Math.round(flowRect.y),
        width: Math.round(flowRect.width),
        height: Math.round(flowRect.height),
      },
      transform: {
        x: Math.round(transform.e * 100) / 100,
        y: Math.round(transform.f * 100) / 100,
        zoom: Math.round(transform.a * 1000) / 1000,
      },
      visible: nodes.filter((entry) => entry.visible).length,
      nodes,
      overlaps,
      offscreenNotice: document.querySelector('.offscreen-notice') !== null,
      persisted: JSON.parse(window.localStorage.getItem(key)),
    };
  }, CANVAS_KEY);
}

async function runScenario(browser, scenario) {
  const context = await browser.newContext({ viewport: scenario.screen });
  await context.addInitScript(
    ({ canvasKey, prefsKey, canvas }) => {
      window.localStorage.setItem(canvasKey, JSON.stringify(canvas));
      window.localStorage.setItem(
        prefsKey,
        JSON.stringify({
          theme: 'light',
          scrollMode: 'zoom',
          drawerOpen: true,
          drawerWidth: 304,
          showMinimap: false,
        }),
      );
    },
    { canvasKey: CANVAS_KEY, prefsKey: PREFS_KEY, canvas: scenario.canvas },
  );
  const page = await context.newPage();
  await page.route('**/api/ticker-lists', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lists }) });
  });
  await page.route('**/api/watchlists/performance', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rows: [], errors: [] }),
    }),
  );
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(80);
  const beforeHydration = await inspectLayout(page);
  await page.waitForSelector('.drawer__item');
  await page.waitForTimeout(120);
  const afterHydration = await inspectLayout(page);
  await page.waitForTimeout(520);
  const afterPersistence = await inspectLayout(page);
  if (scenario.screenshot) {
    await page.screenshot({ path: scenario.screenshot });
  }
  await context.close();
  return {
    name: scenario.name,
    screen: scenario.screen,
    input: scenario.canvas,
    beforeHydration,
    afterHydration,
    afterPersistence,
  };
}

// #region agent log
agentLog('H1,H2,H3,H4,H5', 'frontend/scripts/layout-debug.mjs:207', 'probe entry', {
  base: BASE,
  scenarios: scenarios.map(({ name, screen }) => ({ name, screen })),
});
// #endregion

// #region agent log
agentLog('H1,H2,H4', 'frontend/scripts/layout-debug.mjs:215', 'crafted persisted inputs', {
  viewports: scenarios.map(({ name, canvas }) => ({ name, viewport: canvas.viewport })),
  geometry: scenarios.map(({ name, canvas }) => ({
    name,
    nodes: canvas.nodes.map(({ id, position, style }) => ({ id, position, style })),
  })),
});
// #endregion

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/local/bin/google-chrome' });
const results = [];
try {
  for (const scenario of scenarios) {
    results.push(await runScenario(browser, scenario));
  }
} finally {
  await browser.close();
}

function compact(result, phase) {
  const layout = result[phase];
  return {
    name: result.name,
    screen: result.screen,
    canvas: layout.canvas,
    transform: layout.transform,
    visible: layout.visible,
    nodes: layout.nodes,
    overlaps: layout.overlaps,
    offscreenNotice: layout.offscreenNotice,
  };
}

// #region agent log
agentLog('H1,H2,H3,H4', 'frontend/scripts/layout-debug.mjs:247', 'layout before list hydration', {
  results: results.map((result) => compact(result, 'beforeHydration')),
});
// #endregion

// #region agent log
agentLog('H3', 'frontend/scripts/layout-debug.mjs:253', 'layout after list hydration', {
  results: results.map((result) => compact(result, 'afterHydration')),
});
// #endregion

// #region agent log
agentLog('H2,H5', 'frontend/scripts/layout-debug.mjs:259', 'storage after initial save', {
  results: results.map((result) => ({
    name: result.name,
    inputViewport: result.input.viewport,
    outputViewport: result.afterPersistence.persisted.viewport,
    inputNodes: result.input.nodes.map(({ id, position, style }) => ({ id, position, style })),
    outputNodes: result.afterPersistence.persisted.nodes.map(({ id, position, style }) => ({
      id,
      position,
      style,
    })),
  })),
});
// #endregion

const byName = Object.fromEntries(results.map((result) => [result.name, result]));
const wide = byName['wide-source'].afterPersistence;
const small = byName['small-restored-viewport'].afterPersistence;
const missingWidth = byName['missing-width-upgrade'].afterPersistence;
const storedCollision = byName['stored-collision'].afterPersistence;

// #region agent log
agentLog('H1,H2,H3,H4,H5', 'frontend/scripts/layout-debug.mjs:280', 'hypothesis comparison', {
  sameRestoredTransformAcrossScreens:
    JSON.stringify(wide.transform) === JSON.stringify(small.transform),
  visibleWideVsSmall: [wide.visible, small.visible],
  offscreenNoticeWideVsSmall: [wide.offscreenNotice, small.offscreenNotice],
  missingWidthOverlap: missingWidth.overlaps,
  missingWidthPersistedStyles: missingWidth.persisted.nodes.map(({ id, style }) => ({ id, style })),
  storedCollisionRemains: storedCollision.overlaps,
  hydrationChangedGeometry: results.some(
    (result) =>
      JSON.stringify(result.beforeHydration.nodes) !== JSON.stringify(result.afterHydration.nodes),
  ),
  loadChangedPositions: results.some(
    (result) =>
      JSON.stringify(result.input.nodes.map(({ position }) => position)) !==
      JSON.stringify(result.afterPersistence.persisted.nodes.map(({ position }) => position)),
  ),
});
// #endregion
