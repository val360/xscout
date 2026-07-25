// Compares the main-thread cost of canvas interactions between two running
// builds of xscout. Each interaction is measured in a fresh page that restores
// the same saved canvas, so phases cannot contaminate each other.
//
//   node scripts/perfcheck.mjs before=http://127.0.0.1:5001 after=http://127.0.0.1:5000
//
// Optional: REPEAT=3 to take the median of several runs per phase.
import { chromium } from 'playwright';

const targets = process.argv.slice(2).map((arg) => {
  const [label, url] = arg.split('=');
  return { label, url };
});

if (targets.length === 0) {
  console.error('usage: node scripts/perfcheck.mjs before=<url> after=<url>');
  process.exit(2);
}

const REPEAT = Number(process.env.REPEAT ?? 3);
const LIST_NAMES = ['Megacap Tech', 'Semis', 'Banks', 'Energy'];
const CANVAS_KEY = 'xscout.canvas.v2';

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return Math.round(sorted[index] * 10) / 10;
}

class Probe {
  constructor(page, client) {
    this.page = page;
    this.client = client;
  }

  async counters() {
    const { metrics } = await this.client.send('Performance.getMetrics');
    return Object.fromEntries(metrics.map((entry) => [entry.name, entry.value]));
  }

  async instrumentWrites() {
    await this.page.evaluate((key) => {
      window.__writes = 0;
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (...args) {
        if (args[0] === key) {
          window.__writes += 1;
        }
        return original.apply(this, args);
      };
    }, CANVAS_KEY);
  }

  async startFrames() {
    await this.page.evaluate(() => {
      window.__frames = [];
      let previous = performance.now();
      const loop = () => {
        const now = performance.now();
        window.__frames.push(now - previous);
        previous = now;
        window.__raf = requestAnimationFrame(loop);
      };
      window.__raf = requestAnimationFrame(loop);
    });
  }

  async stopFrames() {
    return this.page.evaluate(() => {
      cancelAnimationFrame(window.__raf);
      return window.__frames.slice(2);
    });
  }

  /** Runs `body` while collecting CDP counters, frame times and canvas writes. */
  async sample(body) {
    await this.page.evaluate(() => {
      window.__writes = 0;
    });
    await this.startFrames();
    const before = await this.counters();
    await body();
    const after = await this.counters();
    const frames = await this.stopFrames();
    await this.page.waitForTimeout(900);
    const writes = await this.page.evaluate(() => window.__writes);
    const ms = (key) => Math.round(((after[key] ?? 0) - (before[key] ?? 0)) * 1000);
    return {
      scriptMs: ms('ScriptDuration'),
      styleMs: ms('RecalcStyleDuration'),
      layoutMs: ms('LayoutDuration'),
      taskMs: ms('TaskDuration'),
      p50FrameMs: percentile(frames, 0.5),
      p95FrameMs: percentile(frames, 0.95),
      writes,
    };
  }
}

async function withPage(url, snapshot, body) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  if (snapshot) {
    await context.addInitScript(
      ([key, value]) => {
        window.localStorage.setItem(key, value);
      },
      [CANVAS_KEY, snapshot],
    );
  }
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Performance.enable');
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.drawer__item, .lists-drawer__item', { timeout: 20000 });
  const probe = new Probe(page, client);
  await probe.instrumentWrites();
  try {
    return await body(page, probe);
  } finally {
    await browser.close();
  }
}

/** Adds every list to a clean canvas and returns the persisted layout. */
async function buildSnapshot({ url }) {
  return withPage(url, null, async (page) => {
    for (const name of LIST_NAMES) {
      const item = page.locator('.drawer__item, .lists-drawer__item').filter({ hasText: name });
      await item.getByRole('button', { name: /^Add$/ }).click();
      await page.waitForTimeout(400);
    }
    await page.waitForFunction(
      () => document.querySelectorAll('.performance-table tbody tr').length >= 30,
      null,
      { timeout: 120000 },
    );
    await page.waitForTimeout(1500);
    return page.evaluate((key) => window.localStorage.getItem(key), CANVAS_KEY);
  });
}

async function waitForCanvas(page) {
  await page.waitForSelector('.ticker-node', { timeout: 20000 });
  await page.waitForFunction(
    () => document.querySelectorAll('.performance-table tbody tr').length >= 30,
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(800);
}

async function emptyPanePoint(page) {
  const point = await page.evaluate(() => {
    for (let y = 900; y > 160; y -= 24) {
      for (let x = 1560; x > 380; x -= 24) {
        const element = document.elementFromPoint(x, y);
        if (element && element.classList.contains('react-flow__pane')) {
          return { x, y };
        }
      }
    }
    return null;
  });
  if (!point) {
    throw new Error('no empty pane point available');
  }
  return point;
}

const phases = {
  async zoom(page, probe) {
    const point = await emptyPanePoint(page);
    await page.mouse.move(point.x, point.y);
    return probe.sample(async () => {
      for (let step = 0; step < 40; step += 1) {
        await page.mouse.wheel(0, Math.floor(step / 10) % 2 === 0 ? -110 : 110);
        await page.waitForTimeout(12);
      }
    });
  },

  async pan(page, probe) {
    const point = await emptyPanePoint(page);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    const sample = await probe.sample(async () => {
      for (let step = 0; step < 90; step += 1) {
        const angle = (step / 90) * Math.PI * 2;
        await page.mouse.move(point.x + Math.cos(angle) * 220, point.y + Math.sin(angle) * 120);
        await page.waitForTimeout(8);
      }
    });
    await page.mouse.up();
    return sample;
  },

  async drag(page, probe) {
    // Both builds mark interactive chrome with `nodrag`, and the layouts differ,
    // so hunt for a pixel that actually starts a drag in whichever build we hit.
    const start = await page.evaluate(() => {
      const node = document.querySelector('.react-flow__node');
      const rect = node.getBoundingClientRect();
      for (let y = Math.round(rect.top) + 10; y < rect.bottom - 24; y += 2) {
        for (let x = Math.round(rect.left) + 10; x < rect.right - 24; x += 8) {
          const element = document.elementFromPoint(x, y);
          if (!element || !node.contains(element)) {
            continue;
          }
          if (element.closest('.nodrag') || element.closest('.react-flow__resize-control')) {
            continue;
          }
          return { x, y };
        }
      }
      return null;
    });
    if (!start) {
      throw new Error('no draggable pixel found on the card');
    }
    const positionBefore = await page.evaluate(() => {
      const rect = document.querySelector('.react-flow__node').getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y) };
    });

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    const sample = await probe.sample(async () => {
      for (let step = 0; step < 90; step += 1) {
        const angle = (step / 90) * Math.PI * 2;
        await page.mouse.move(start.x + Math.cos(angle) * 150, start.y + Math.sin(angle) * 80);
        await page.waitForTimeout(8);
      }
    });
    await page.mouse.move(start.x + 120, start.y + 60);
    await page.mouse.up();
    const positionAfter = await page.evaluate(() => {
      const rect = document.querySelector('.react-flow__node').getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y) };
    });
    if (positionBefore.x === positionAfter.x && positionBefore.y === positionAfter.y) {
      throw new Error('drag did not move the card');
    }
    return sample;
  },

  async resize(page, probe) {
    const nodeId = await page.evaluate(() => {
      const element = document.querySelector('.react-flow__node');
      element.click();
      return element.dataset.id;
    });
    await page.waitForTimeout(300);
    const grip = await page
      .locator(`[data-id="${nodeId}"] .react-flow__resize-control.handle.bottom.right`)
      .boundingBox();
    const widthBefore = await page.evaluate(
      (id) => Math.round(document.querySelector(`[data-id="${id}"]`).getBoundingClientRect().width),
      nodeId,
    );
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    const sample = await probe.sample(async () => {
      for (let step = 1; step <= 60; step += 1) {
        const offset = (step / 60) * 200 + Math.sin(step / 3) * 18;
        await page.mouse.move(
          grip.x + grip.width / 2 + offset,
          grip.y + grip.height / 2 + offset * 0.6,
        );
        await page.waitForTimeout(8);
      }
    });
    await page.mouse.up();
    const widthAfter = await page.evaluate(
      (id) => Math.round(document.querySelector(`[data-id="${id}"]`).getBoundingClientRect().width),
      nodeId,
    );
    if (widthAfter <= widthBefore + 50) {
      throw new Error(`resize did not take effect: ${widthBefore} -> ${widthAfter}`);
    }
    return sample;
  },
};

const report = {};
for (const target of targets) {
  console.log(`\n=== ${target.label} (${target.url}) ===`);
  const snapshot = await buildSnapshot(target);
  console.log(`  saved canvas: ${(snapshot.length / 1024).toFixed(1)} KiB`);
  report[target.label] = { canvasPayloadKiB: Math.round((snapshot.length / 1024) * 10) / 10 };

  const selected = process.env.PHASES
    ? Object.entries(phases).filter(([name]) => process.env.PHASES.split(',').includes(name))
    : Object.entries(phases);

  for (const [name, phase] of selected) {
    const samples = [];
    for (let run = 0; run < REPEAT; run += 1) {
      samples.push(
        await withPage(target.url, snapshot, async (page, probe) => {
          await waitForCanvas(page);
          return phase(page, probe);
        }),
      );
    }
    const merged = {};
    for (const key of Object.keys(samples[0])) {
      merged[key] = median(samples.map((sample) => sample[key]));
    }
    report[target.label][name] = merged;
    console.log(`  ${name}: ${JSON.stringify(merged)}`);
  }
}

const labels = targets.map((target) => target.label);
console.log(`\nmedian of ${REPEAT} runs per phase\n`);
const rows = [['metric', ...labels]];
rows.push(['canvas payload (KiB)', ...labels.map((label) => report[label].canvasPayloadKiB)]);
for (const phase of Object.keys(report[labels[0]]).filter((key) => key !== 'canvasPayloadKiB')) {
  for (const metric of ['taskMs', 'scriptMs', 'styleMs', 'layoutMs', 'p50FrameMs', 'p95FrameMs', 'writes']) {
    rows.push([`${phase} ${metric}`, ...labels.map((label) => report[label][phase][metric])]);
  }
}
const pad = Math.max(...rows.map((row) => String(row[0]).length)) + 2;
for (const row of rows) {
  console.log(String(row[0]).padEnd(pad) + row.slice(1).map((cell) => String(cell).padStart(14)).join(''));
}
