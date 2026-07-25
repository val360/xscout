export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2.5;

/** Duration for programmatic viewport tweens (zoom buttons, fit view). */
export const VIEWPORT_TWEEN_MS = 180;

/** Wide enough that every performance column fits without horizontal scrolling. */
export const DEFAULT_NODE_WIDTH = 840;
export const MIN_NODE_WIDTH = 320;
export const MIN_NODE_HEIGHT = 200;

/**
 * Card chrome that never scrolls: title row, timestamp, table header and the
 * add-ticker footer. Re-derive with `node scripts/measure-card.mjs` after
 * changing any of those.
 */
const NODE_CHROME_HEIGHT = 144;

/** Height of one table row, same source. */
const NODE_ROW_HEIGHT = 29;

/** New cards stop growing here and scroll their table instead. */
const MAX_NEW_NODE_HEIGHT = 620;

/** Stand-in height for a card whose size is unknown. */
export const ESTIMATED_NODE_HEIGHT = 360;

/** Breathing room left between cards when placing a new one. */
export const NODE_GAP = 28;

/**
 * Height that fits `tickerCount` rows without scrolling. New cards get this as
 * an explicit style height rather than growing into it, so their footprint is
 * known the moment they are placed — otherwise a card that is still fetching
 * measures short, and the next card lands on top of where it is about to grow.
 */
export function nodeHeightForTickers(tickerCount: number): number {
  const fitted = NODE_CHROME_HEIGHT + tickerCount * NODE_ROW_HEIGHT;
  return Math.min(MAX_NEW_NODE_HEIGHT, Math.max(MIN_NODE_HEIGHT, fitted));
}

/** MIME type used when dragging a list out of the drawer onto the canvas. */
export const LIST_DRAG_MIME = 'application/x-xscout-list';
