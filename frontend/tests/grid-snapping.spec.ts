import { expect, test, type Page } from '@playwright/test';

const CANVAS_KEY = 'xscout.canvas.v3';
const SNAP_SIZE = 11;

type StoredNodeLayout = {
  position: { x: number; y: number };
  style: { width: number; height: number };
};

async function mockApi(page: Page) {
  await page.route('**/api/ticker-lists', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        lists: [
          {
            id: 'grid-list',
            name: 'Grid alignment',
            tickers: ['AAPL'],
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    }),
  );
  await page.route('**/api/watchlists/performance', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rows: [], errors: [] }),
    }),
  );
}

async function storedNode(page: Page): Promise<StoredNodeLayout> {
  return page.evaluate((key) => {
    const canvas = JSON.parse(window.localStorage.getItem(key) ?? '{"nodes":[]}');
    const node = canvas.nodes[0];
    return {
      position: node.position,
      style: {
        width: Number(node.style.width),
        height: Number(node.style.height),
      },
    };
  }, CANVAS_KEY);
}

function expectOnGrid(value: number) {
  expect(value).toBeCloseTo(Math.round(value / SNAP_SIZE) * SNAP_SIZE, 5);
}

test('dragging and resizing use half-grid increments and persist across reload', async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(
    ({ canvasKey, canvas }) => {
      if (window.localStorage.getItem(canvasKey)) {
        return;
      }
      window.localStorage.clear();
      window.localStorage.setItem(canvasKey, JSON.stringify(canvas));
      window.localStorage.setItem(
        'xscout.prefs.v1',
        JSON.stringify({
          theme: 'light',
          scrollMode: 'zoom',
          drawerOpen: false,
          drawerWidth: 304,
          showMinimap: false,
        }),
      );
    },
    {
      canvasKey: CANVAS_KEY,
      canvas: {
        nodes: [
          {
            id: 'grid-node',
            type: 'tickerList',
            position: { x: 220, y: 132 },
            style: { width: 440, height: 330 },
            data: {
              listId: 'grid-list',
              name: 'Grid alignment',
              tickers: ['AAPL'],
              rows: [],
              errors: [],
              status: 'idle',
            },
          },
        ],
        edges: [],
        viewport: { center: { x: 640, y: 373 }, zoom: 1 },
      },
    },
  );

  await page.goto('/');
  const node = page.locator('[data-id="grid-node"]');
  await expect(node).toBeVisible();
  await page.waitForTimeout(450);

  const beforeDrag = await storedNode(page);
  const dragBox = await node.boundingBox();
  if (!dragBox) {
    throw new Error('Grid node has no bounding box');
  }
  const dragStart = { x: dragBox.x + 24, y: dragBox.y + 55 };
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + 37, dragStart.y + 25, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(550);

  const afterDrag = await storedNode(page);
  expect(afterDrag.position).not.toEqual(beforeDrag.position);
  expectOnGrid(afterDrag.position.x);
  expectOnGrid(afterDrag.position.y);
  expectOnGrid(afterDrag.position.x - beforeDrag.position.x);
  expectOnGrid(afterDrag.position.y - beforeDrag.position.y);

  const beforeResize = afterDrag;
  const resizeControl = node.locator('.react-flow__resize-control.handle.bottom.right');
  await expect(resizeControl).toBeVisible();
  const handleBox = await resizeControl.boundingBox();
  if (!handleBox) {
    throw new Error('Bottom-right resize control has no bounding box');
  }
  const resizeStart = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  };
  await page.mouse.move(resizeStart.x, resizeStart.y);
  await page.mouse.down();
  await page.mouse.move(resizeStart.x + 37, resizeStart.y + 25, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(550);

  const afterResize = await storedNode(page);
  expect(afterResize.style.width).toBeGreaterThan(beforeResize.style.width);
  expect(afterResize.style.height).toBeGreaterThan(beforeResize.style.height);
  expectOnGrid(afterResize.style.width);
  expectOnGrid(afterResize.style.height);
  expectOnGrid(afterResize.style.width - beforeResize.style.width);
  expectOnGrid(afterResize.style.height - beforeResize.style.height);

  await page.reload();
  await expect(node).toBeVisible();
  await expect(node).toHaveCSS('width', `${afterResize.style.width}px`);
  await expect(node).toHaveCSS('height', `${afterResize.style.height}px`);
  await page.waitForTimeout(450);

  const afterReload = await storedNode(page);
  expect(afterReload).toEqual(afterResize);
});
