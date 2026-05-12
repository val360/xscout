import type { Edge, Node, Viewport } from '@xyflow/react';
import type { TickerListNodeData } from '../components/TickerListNode';

const STORAGE_KEY_V1 = 'xscout.canvas.v1';
const STORAGE_KEY_V2 = 'xscout.canvas.v2';

// v2 canvas state holds layout only: each node references a server-side
// ticker list by `listId`. Names and tickers live in Postgres.
export type CanvasNode = Node<TickerListNodeData, 'tickerList'>;

export type StoredCanvas = {
  nodes: CanvasNode[];
  edges: Edge[];
  viewport?: Viewport;
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

export function loadCanvas(): StoredCanvas | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_V2);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredCanvas;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveCanvas(canvas: StoredCanvas): void {
  window.localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(canvas));
}

export function loadLegacyCanvas(): LegacyCanvas | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_V1);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as LegacyCanvas;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
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
