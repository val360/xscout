import { memo, useEffect, useState } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import type { PerformanceRow } from '../api/watchlists';
import { parseTickers } from '../storage/savedLists';
import { PerformanceTable } from './PerformanceTable';

export type TickerListStatus = 'idle' | 'loading' | 'ready' | 'error';

// Node `data` carries the layout id plus _derived_ list content (name,
// tickers) supplied by `App.tsx` from the lists context. The mutating
// callbacks fire against the lists context, not against per-node state.
export type TickerListNodeData = {
  listId: string;
  name: string;
  tickers: string[];
  rows: PerformanceRow[];
  errors: string[];
  status: TickerListStatus;
  missing?: boolean;
  onRemoveFromCanvas?: (nodeId: string) => void;
  onRefresh?: (nodeId: string) => void;
  onRename?: (listId: string, name: string) => void;
  onSetTickers?: (nodeId: string, listId: string, tickers: string[]) => void;
} & Record<string, unknown>;

function TickerListNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as TickerListNodeData;
  const [name, setName] = useState(nodeData.name);

  useEffect(() => {
    setName(nodeData.name);
  }, [nodeData.name]);

  function commitName() {
    const cleaned = name.trim();
    if (!cleaned) {
      setName(nodeData.name);
      return;
    }
    if (cleaned === nodeData.name) {
      return;
    }
    nodeData.onRename?.(nodeData.listId, cleaned);
  }

  function handleAddTicker(raw: string) {
    const parsed = parseTickers(raw);
    if (parsed.length === 0) {
      return;
    }
    const merged = [...nodeData.tickers];
    let changed = false;
    for (const ticker of parsed) {
      if (!merged.includes(ticker)) {
        merged.push(ticker);
        changed = true;
      }
    }
    if (!changed) {
      return;
    }
    nodeData.onSetTickers?.(id, nodeData.listId, merged);
  }

  return (
    <article className="ticker-node">
      <NodeResizer isVisible={selected} minWidth={360} minHeight={260} />
      <header className="ticker-node__header">
        <div className="ticker-node__title-row">
          <input
            className="ticker-node__title nodrag"
            aria-label="Ticker list name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
          />
          <p>{nodeData.tickers.length} tickers</p>
          <div className="ticker-node__header-actions nodrag">
            <button
              className="ghost-button icon-button"
              type="button"
              disabled={nodeData.status === 'loading' || nodeData.missing}
              aria-label="Refresh performance data"
              title="Refresh performance"
              onClick={() => nodeData.onRefresh?.(id)}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                <path
                  d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z"
                  fill="currentColor"
                />
              </svg>
            </button>
            <button
              className="ticker-node__close-button icon-button"
              type="button"
              aria-label={`Close ${nodeData.name || 'this list'} on canvas`}
              title="Remove from canvas (list stays in your library)"
              onClick={() => nodeData.onRemoveFromCanvas?.(id)}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                <path
                  d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {nodeData.missing ? (
        <div className="errors">This list is no longer in your library.</div>
      ) : null}

      {nodeData.errors.length > 0 ? (
        <div className="errors">
          {nodeData.errors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      ) : null}

      <PerformanceTable
        rows={nodeData.rows}
        onAddTicker={nodeData.missing ? undefined : handleAddTicker}
      />
    </article>
  );
}

export const TickerListNode = memo(TickerListNodeComponent);
