import type { Edge, Node, Viewport, XYPosition } from '@xyflow/react';
import type { TickerListNodeData } from '../components/TickerListNode';

const STORAGE_KEY_V1 = 'xscout.canvas.v1';
const STORAGE_KEY_V2 = 'xscout.canvas.v2';
const STORAGE_KEY_V3 = 'xscout.canvas.v3';

// Canvas state holds layout only: each node references a server-side ticker
// list by `listId`. Names and tickers live in Postgres.
export type CanvasNode = Node<TickerListNodeData, 'tickerList'>;

export type CanvasSize = {
  width: number;
  height: number;
};

/**
 * A React Flow transform is anchored to the canvas's top-left pixel. Persisting
 * the flow-space point at the canvas center makes the same view portable to a
 * canvas with different pixel dimensions.
 */
export type StoredViewport = {
  center: XYPosition;
  zoom: number;
};

export type StoredCanvas = {
  nodes: CanvasNode[];
  edges: Edge[];
  viewport?: StoredViewport;
};

export type LoadedCanvas = StoredCanvas & {
  /** Raw v2 transform retained only long enough to migrate it to v3. */
  rawViewport?: Viewport;
};

type V1CanvasNode = Node<
  {
    name?: string;
    tickers?: string[];
    [key: string]: unknown;
  },
  'tickerList'
>;

export type LegacyCanvas = {
  nodes: V1CanvasNode[];
  edges: Edge[];
  viewport?: Viewport;
};

type V2Canvas = {
  nodes: CanvasNode[];
  edges: Edge[];
  viewport?: Viewport;
};

function readCanvas(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isCanvasShape(value: unknown): value is { nodes: CanvasNode[]; edges: Edge[] } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { nodes?: unknown; edges?: unknown };
  return Array.isArray(candidate.nodes) && Array.isArray(candidate.edges);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isViewport(value: unknown): value is Viewport {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<Viewport>;
  return (
    isFiniteNumber(candidate.x) &&
    isFiniteNumber(candidate.y) &&
    isFiniteNumber(candidate.zoom) &&
    (candidate.zoom ?? 0) > 0
  );
}

function isStoredViewport(value: unknown): value is StoredViewport {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as {
    center?: Partial<XYPosition>;
    zoom?: number;
  };
  return (
    typeof candidate.center === 'object' &&
    candidate.center !== null &&
    isFiniteNumber(candidate.center.x) &&
    isFiniteNumber(candidate.center.y) &&
    isFiniteNumber(candidate.zoom) &&
    (candidate.zoom ?? 0) > 0
  );
}

export function viewportToStoredViewport(
  viewport: Viewport,
  canvas: CanvasSize,
): StoredViewport {
  return {
    center: {
      x: (canvas.width / 2 - viewport.x) / viewport.zoom,
      y: (canvas.height / 2 - viewport.y) / viewport.zoom,
    },
    zoom: viewport.zoom,
  };
}

export function storedViewportToViewport(
  viewport: StoredViewport,
  canvas: CanvasSize,
): Viewport {
  return {
    x: canvas.width / 2 - viewport.center.x * viewport.zoom,
    y: canvas.height / 2 - viewport.center.y * viewport.zoom,
    zoom: viewport.zoom,
  };
}

export function loadCanvas(): LoadedCanvas | null {
  const v3 = readCanvas(STORAGE_KEY_V3);
  if (isCanvasShape(v3)) {
    const candidate = v3 as StoredCanvas;
    return {
      nodes: candidate.nodes,
      edges: candidate.edges,
      viewport: isStoredViewport(candidate.viewport) ? candidate.viewport : undefined,
    };
  }

  const v2 = readCanvas(STORAGE_KEY_V2);
  if (!isCanvasShape(v2)) {
    return null;
  }
  const candidate = v2 as V2Canvas;
  return {
    nodes: candidate.nodes,
    edges: candidate.edges,
    rawViewport: isViewport(candidate.viewport) ? candidate.viewport : undefined,
  };
}

export function saveCanvas(canvas: StoredCanvas): void {
  window.localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(canvas));
}

export function loadLegacyCanvas(): LegacyCanvas | null {
  const parsed = readCanvas(STORAGE_KEY_V1);
  if (!isCanvasShape(parsed)) {
    return null;
  }
  return parsed as LegacyCanvas;
}

export function clearLegacyCanvas(): void {
  window.localStorage.removeItem(STORAGE_KEY_V1);
}

export function parseTickers(rawTickers: string): string[] {
  return rawTickers
    .split(/[\s,]+/)
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);
}

export function formatTickers(tickers: string[]): string {
  return tickers.join(', ');
}
