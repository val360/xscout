import { appendFileSync } from 'node:fs';
import { expect, test, type Browser, type Page, type ViewportSize } from '@playwright/test';
import {
  storedViewportToViewport,
  viewportToStoredViewport,
} from '../src/storage/savedLists';

const CANVAS_KEY_V1 = 'xscout.canvas.v1';
const CANVAS_KEY_V2 = 'xscout.canvas.v2';
const CANVAS_KEY_V3 = 'xscout.canvas.v3';
const PREFS_KEY = 'xscout.prefs.v1';
const LOG_PATH = '/opt/cursor/logs/debug.log';
const RUN_PHASE = process.env.VIEWPORT_TEST_PHASE ?? 'unspecified';

const sourceNode = {
  id: 'saved-node',
  type: 'tickerList',
  position: { x: 1100, y: 700 },
  style: { width: 560, height: 300 },
  data: {
    listId: 'existing-list',
    name: 'Saved list',
    tickers: ['AAPL'],
    rows: [],
    errors: [],
    status: 'idle',
  },
};

const rawViewport = { x: -800, y: -500, zoom: 0.75 };
const wideScreen = { width: 1920, height: 1080 };
const smallScreen = { width: 1280, height: 720 };

type JsonObject = Record<string, unknown>;

type LayoutMeasurement = {
  screen: ViewportSize;
  canvas: { width: number; height: number };
  transform: { x: number; y: number; zoom: number };
  flowCenter: { x: number; y: number };
  node: {
    position: { x: number; y: number };
    style: { width: number; height: number };
  } | null;
  storage: {
    v1: JsonObject | null;
    v2: JsonObject | null;
    v3: JsonObject | null;
  };
};

function agentLog(hypothesisId: string, location: string, message: string, data: unknown) {
  appendFileSync(
    LOG_PATH,
    `${JSON.stringify({
      hypothesisId,
      location,
      message,
      data: { runPhase: RUN_PHASE, value: data },
      timestamp: Date.now(),
    })}\n`,
  );
}

async function openStoredCanvas(
  browser: Browser,
  screen: ViewportSize,
  storage: { v1?: JsonObject; v2?: JsonObject; v3?: JsonObject },
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: screen });
  await context.addInitScript(
    ({ keys, values }) => {
      window.localStorage.clear();
      window.localStorage.setItem(
        keys.preferences,
        JSON.stringify({
          theme: 'light',
          scrollMode: 'zoom',
          drawerOpen: false,
          drawerWidth: 304,
          showMinimap: false,
        }),
      );
      for (const [name, value] of Object.entries(values)) {
        if (value !== undefined) {
          window.localStorage.setItem(keys[name as keyof typeof keys], JSON.stringify(value));
        }
      }
    },
    {
      keys: {
        v1: CANVAS_KEY_V1,
        v2: CANVAS_KEY_V2,
        v3: CANVAS_KEY_V3,
        preferences: PREFS_KEY,
      },
      values: storage,
    },
  );

  const page = await context.newPage();
  await page.route('**/api/ticker-lists', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'migrated-list',
          name: 'Legacy fixture',
          tickers: ['AAPL'],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        lists: [
          { id: 'existing-list', name: 'Saved list', tickers: ['AAPL'] },
          { id: 'migrated-list', name: 'Legacy fixture', tickers: ['AAPL'] },
        ],
      }),
    });
  });
  await page.route('**/api/watchlists/performance', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rows: [], errors: [] }),
    }),
  );
  await page.goto('/');
  return { page, close: () => context.close() };
}

async function measure(page: Page, screen: ViewportSize): Promise<LayoutMeasurement> {
  await page.waitForSelector('.react-flow__node');
  await page.waitForTimeout(650);
  return page.evaluate(
    ({ keys, browserScreen }) => {
      const flow = document.querySelector('.react-flow');
      const viewport = document.querySelector('.react-flow__viewport');
      if (!(flow instanceof HTMLElement) || !(viewport instanceof HTMLElement)) {
        throw new Error('React Flow did not mount');
      }
      const rect = flow.getBoundingClientRect();
      const matrix = new DOMMatrixReadOnly(getComputedStyle(viewport).transform);
      const zoom = matrix.a;
      const storedNode = JSON.parse(
        window.localStorage.getItem(keys.v3) ??
          window.localStorage.getItem(keys.v2) ??
          '{"nodes":[]}',
      ).nodes?.[0];
      return {
        screen: browserScreen,
        canvas: { width: rect.width, height: rect.height },
        transform: { x: matrix.e, y: matrix.f, zoom },
        flowCenter: {
          x: (rect.width / 2 - matrix.e) / zoom,
          y: (rect.height / 2 - matrix.f) / zoom,
        },
        node: storedNode
          ? {
              position: storedNode.position,
              style: storedNode.style,
            }
          : null,
        storage: {
          v1: JSON.parse(window.localStorage.getItem(keys.v1) ?? 'null'),
          v2: JSON.parse(window.localStorage.getItem(keys.v2) ?? 'null'),
          v3: JSON.parse(window.localStorage.getItem(keys.v3) ?? 'null'),
        },
      };
    },
    {
      keys: { v1: CANVAS_KEY_V1, v2: CANVAS_KEY_V2, v3: CANVAS_KEY_V3 },
      browserScreen: screen,
    },
  );
}

test('flow-space center is stable at exact 1920x1080 and 1280x720 canvas sizes', () => {
  const sourceCanvas = { width: 1920, height: 1080 };
  const targetCanvas = { width: 1280, height: 720 };
  const stored = viewportToStoredViewport(rawViewport, sourceCanvas);
  const restored = storedViewportToViewport(stored, targetCanvas);
  const targetCenter = viewportToStoredViewport(restored, targetCanvas);

  expect(targetCenter.center.x).toBeCloseTo(stored.center.x, 10);
  expect(targetCenter.center.y).toBeCloseTo(stored.center.y, 10);
  expect(targetCenter.zoom).toBe(stored.zoom);
  expect(restored).toEqual({ x: -1120, y: -680, zoom: 0.75 });
});

test('migrates raw transforms and preserves flow-space center across resolutions', async ({
  browser,
}) => {
  const v2Fixture = {
    nodes: [sourceNode],
    edges: [],
    viewport: rawViewport,
  };

  // #region agent log
  agentLog('H5,H6', 'tests/viewport-persistence.spec.ts:v2-fixture', 'raw v2 fixture', {
    screenSizes: [wideScreen, smallScreen],
    viewport: rawViewport,
    node: { position: sourceNode.position, style: sourceNode.style },
  });
  // #endregion

  const wideRun = await openStoredCanvas(browser, wideScreen, { v2: v2Fixture });
  const wide = await measure(wideRun.page, wideScreen);
  await wideRun.close();
  // #region agent log
  agentLog('H5', 'tests/viewport-persistence.spec.ts:v2-wide', 'raw v2 wide restore', wide);
  // #endregion

  const smallRun = await openStoredCanvas(browser, smallScreen, { v2: v2Fixture });
  const small = await measure(smallRun.page, smallScreen);
  await smallRun.close();
  // #region agent log
  agentLog('H5', 'tests/viewport-persistence.spec.ts:v2-small', 'raw v2 small restore', small);
  // #endregion

  const migratedV3 = wide.storage.v3;
  let portable: LayoutMeasurement | null = null;
  if (migratedV3 !== null) {
    const portableRun = await openStoredCanvas(browser, smallScreen, { v3: migratedV3 });
    portable = await measure(portableRun.page, smallScreen);
    await portableRun.close();
  }
  // #region agent log
  agentLog(
    'H5,H6',
    'tests/viewport-persistence.spec.ts:v3-portable',
    'migrated center restore comparison',
    { wide, portable },
  );
  // #endregion

  const legacyFixture = {
    nodes: [
      {
        id: 'legacy-node',
        type: 'tickerList',
        position: { x: 1100, y: 700 },
        style: { width: 560, height: 300 },
        data: { name: 'Legacy fixture', tickers: ['AAPL'] },
      },
    ],
    edges: [],
    viewport: rawViewport,
  };
  const legacyRun = await openStoredCanvas(browser, smallScreen, { v1: legacyFixture });
  await legacyRun.page.waitForFunction(
    (key) => window.localStorage.getItem(key) === null,
    CANVAS_KEY_V1,
  );
  const legacy = await measure(legacyRun.page, smallScreen);
  await legacyRun.close();
  // #region agent log
  agentLog(
    'H1,H3,H6',
    'tests/viewport-persistence.spec.ts:legacy',
    'legacy migration viewport result',
    legacy,
  );
  // #endregion

  const summary = {
    rawCenterDelta: {
      x: wide.flowCenter.x - small.flowCenter.x,
      y: wide.flowCenter.y - small.flowCenter.y,
    },
    portableCenterDelta:
      portable === null
        ? null
        : {
            x: wide.flowCenter.x - portable.flowCenter.x,
            y: wide.flowCenter.y - portable.flowCenter.y,
          },
    migratedV3: migratedV3 !== null,
    legacyTransform: legacy.transform,
    legacyV3: legacy.storage.v3 !== null,
  };
  // #region agent log
  agentLog(
    'H1,H5,H6',
    'tests/viewport-persistence.spec.ts:summary',
    'viewport persistence assertions',
    summary,
  );
  // #endregion
  console.log(JSON.stringify(summary, null, 2));

  expect(Math.abs(summary.rawCenterDelta.x)).toBeGreaterThan(400);
  expect(Math.abs(summary.rawCenterDelta.y)).toBeGreaterThan(200);
  expect(migratedV3).not.toBeNull();
  expect(portable).not.toBeNull();
  expect(portable?.flowCenter.x).toBeCloseTo(wide.flowCenter.x, 5);
  expect(portable?.flowCenter.y).toBeCloseTo(wide.flowCenter.y, 5);
  expect(portable?.node).toEqual({
    position: sourceNode.position,
    style: sourceNode.style,
  });
  expect(legacy.transform.x).toBeCloseTo(rawViewport.x, 5);
  expect(legacy.transform.y).toBeCloseTo(rawViewport.y, 5);
  expect(legacy.transform.zoom).toBeCloseTo(rawViewport.zoom, 5);
  expect(legacy.storage.v1).toBeNull();
  expect(legacy.storage.v3).not.toBeNull();
});
