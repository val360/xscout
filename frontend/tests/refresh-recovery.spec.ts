import { expect, test, type Page, type Route } from '@playwright/test';

const CANVAS_KEY_V3 = 'xscout.canvas.v3';
const PREFS_KEY = 'xscout.prefs.v1';

const listFixture = { id: 'list-1', name: 'Saved list', tickers: ['AAPL'] };

const storedNode = {
  id: 'node-1',
  type: 'tickerList',
  position: { x: 120, y: 120 },
  style: { width: 560, height: 300 },
  data: {
    listId: listFixture.id,
    name: listFixture.name,
    tickers: listFixture.tickers,
    rows: [],
    errors: [],
    status: 'idle',
    updatedAt: 1_700_000_000_000,
  },
};

const performanceResponse = {
  rows: [
    {
      ticker: 'AAPL',
      price: '$100.00',
      marketCap: '$1.00T',
      change1d: '+1.0%',
      change1dClass: 'positive',
      change5d: '+1.0%',
      change5dClass: 'positive',
      change2w: '+1.0%',
      change2wClass: 'positive',
      change1m: '+1.0%',
      change1mClass: 'positive',
      change3m: '+1.0%',
      change3mClass: 'positive',
      change6m: '+1.0%',
      change6mClass: 'positive',
      change1y: '+1.0%',
      change1yClass: 'positive',
      change5y: '+1.0%',
      change5yClass: 'positive',
    },
  ],
  errors: [],
};

type PerformanceRouting = {
  /** Number of performance requests seen so far. */
  count: () => number;
  /** Releases every request currently parked by `hold()`. */
  release: () => Promise<void>;
  /** Parks subsequent requests until `release()` is called. */
  hold: () => void;
  /** Lets subsequent requests resolve immediately. */
  passthrough: () => void;
};

async function routePerformance(page: Page): Promise<PerformanceRouting> {
  let holding = false;
  let count = 0;
  const parked: Route[] = [];

  await page.route('**/api/watchlists/performance', async (route) => {
    count += 1;
    if (holding) {
      parked.push(route);
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(performanceResponse),
    });
  });

  return {
    count: () => count,
    hold: () => {
      holding = true;
    },
    passthrough: () => {
      holding = false;
    },
    release: async () => {
      holding = false;
      const pending = parked.splice(0);
      for (const route of pending) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(performanceResponse),
        });
      }
    },
  };
}

async function seedStorage(page: Page, nodeStatus: string) {
  await page.addInitScript(
    ({ keys, node, status }) => {
      if (window.sessionStorage.getItem('xscout.test.seeded')) {
        return;
      }
      window.sessionStorage.setItem('xscout.test.seeded', '1');
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
      window.localStorage.setItem(
        keys.canvas,
        JSON.stringify({
          nodes: [{ ...node, data: { ...node.data, status } }],
          edges: [],
        }),
      );
    },
    {
      keys: { canvas: CANVAS_KEY_V3, preferences: PREFS_KEY },
      node: storedNode,
      status: nodeStatus,
    },
  );
}

async function routeLists(page: Page) {
  await page.route('**/api/ticker-lists', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ lists: [listFixture] }),
    }),
  );
}

async function readStoredStatus(page: Page): Promise<string | undefined> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return undefined;
    }
    return JSON.parse(raw).nodes?.[0]?.data?.status as string | undefined;
  }, CANVAS_KEY_V3);
}

function nodeRefreshButton(page: Page) {
  return page.getByRole('button', { name: 'Refresh performance data' });
}

test('a card whose refresh was interrupted before reload recovers', async ({ page }) => {
  await seedStorage(page, 'loading');
  await routeLists(page);
  const performance = await routePerformance(page);

  await page.goto('/');
  await page.waitForSelector('.react-flow__node');

  // The card is not left on "Refreshing…" with a disabled refresh button.
  await expect(nodeRefreshButton(page)).toBeEnabled({ timeout: 5_000 });
  await expect(page.locator('.ticker-node')).not.toHaveClass(/is-loading/);
  await expect(page.locator('.ticker-node__meta')).not.toHaveText('Refreshing…');
  await expect(page.getByRole('button', { name: /Refresh all/ })).toBeEnabled();

  // The interrupted refresh is resumed so the card ends up with fresh rows.
  await expect(page.locator('.ticker-node')).toContainText('AAPL');
  expect(performance.count()).toBeGreaterThanOrEqual(1);

  // Storage no longer carries the stale in-flight marker.
  await page.waitForTimeout(600);
  expect(await readStoredStatus(page)).toBe('ready');
});

test('reloading mid-refresh does not leave the card stuck', async ({ page }) => {
  await seedStorage(page, 'idle');
  await routeLists(page);
  const performance = await routePerformance(page);

  await page.goto('/');
  await page.waitForSelector('.react-flow__node');
  await expect(nodeRefreshButton(page)).toBeEnabled();

  performance.hold();
  await nodeRefreshButton(page).click();
  await expect(page.locator('.ticker-node')).toHaveClass(/is-loading/);
  await expect(nodeRefreshButton(page)).toBeDisabled();

  // Wait for the debounced save so storage reflects the in-flight refresh
  // exactly as it would if the tab were closed or reloaded at this moment.
  await page.waitForTimeout(600);

  performance.passthrough();
  await page.reload();
  await page.waitForSelector('.react-flow__node');

  await expect(nodeRefreshButton(page)).toBeEnabled({ timeout: 5_000 });
  await expect(page.locator('.ticker-node')).not.toHaveClass(/is-loading/);
  await expect(page.locator('.ticker-node')).toContainText('AAPL');
});

test('switching to the Watts view mid-refresh and back does not leave the card stuck', async ({
  page,
}) => {
  await seedStorage(page, 'idle');
  await routeLists(page);
  const performance = await routePerformance(page);
  await page.route('**/api/watts/dashboard**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generatedAt: '2026-01-01T00:00:00Z',
        title: 'Watts',
        subtitle: '',
        thesis: '',
        sourceNote: '',
        northStar: { title: 'North star', lede: '', spreads: [] },
        panels: [],
        errors: [],
      }),
    }),
  );

  await page.goto('/');
  await page.waitForSelector('.react-flow__node');

  performance.hold();
  await nodeRefreshButton(page).click();
  await expect(page.locator('.ticker-node')).toHaveClass(/is-loading/);

  await page.getByRole('tab', { name: 'Watts' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);

  // The original request finishes while the canvas is unmounted.
  await performance.release();
  performance.passthrough();

  await page.getByRole('tab', { name: 'Canvas' }).click();
  await page.waitForSelector('.react-flow__node');

  await expect(nodeRefreshButton(page)).toBeEnabled({ timeout: 5_000 });
  await expect(page.locator('.ticker-node')).not.toHaveClass(/is-loading/);
  await expect(page.locator('.ticker-node')).toContainText('AAPL');
});
