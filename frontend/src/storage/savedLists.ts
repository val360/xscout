import type { Edge, Node, Viewport } from '@xyflow/react';
import type { TickerListNodeData } from '../components/TickerListNode';

const STORAGE_KEY = 'xscout.canvas.v1';

export type StoredCanvas = {
  nodes: Array<Node<TickerListNodeData, 'tickerList'>>;
  edges: Edge[];
  viewport?: Viewport;
};

export function loadCanvas(): StoredCanvas | null {
  try {
    const rawCanvas = window.localStorage.getItem(STORAGE_KEY);
    if (!rawCanvas) {
      return null;
    }

    const parsed = JSON.parse(rawCanvas) as StoredCanvas;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function saveCanvas(canvas: StoredCanvas): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(canvas));
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
