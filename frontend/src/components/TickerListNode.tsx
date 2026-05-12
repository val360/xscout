import { memo, useEffect, useState } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import type { PerformanceRow } from '../api/watchlists';
import { formatTickers, parseTickers } from '../storage/savedLists';
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
  onSetTickers?: (listId: string, tickers: string[]) => void;
} & Record<string, unknown>;

function TickerListNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as TickerListNodeData;
  const [name, setName] = useState(nodeData.name);
  const [tickers, setTickers] = useState(formatTickers(nodeData.tickers));

  // Keep local editing state in sync when the underlying list mutates
  // somewhere else (e.g. renamed in the sidebar, or another tab).
  useEffect(() => {
    setName(nodeData.name);
  }, [nodeData.name]);
  useEffect(() => {
    setTickers(formatTickers(nodeData.tickers));
  }, [nodeData.tickers]);

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

  function commitTickers() {
    const parsed = parseTickers(tickers);
    if (
      parsed.length === nodeData.tickers.length &&
      parsed.every((value, index) => value === nodeData.tickers[index])
    ) {
      return;
    }
    nodeData.onSetTickers?.(nodeData.listId, parsed);
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
          <button
            className="danger-button icon-button nodrag"
            type="button"
            aria-label={`Remove ${nodeData.name || 'this list'} from canvas`}
            title="Remove from canvas (list stays in your library)"
            onClick={() => nodeData.onRemoveFromCanvas?.(id)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
              <path
                d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 11H7.7L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
        <p>{nodeData.tickers.length} tickers</p>
      </header>

      {nodeData.missing ? (
        <div className="errors">This list is no longer in your library.</div>
      ) : null}

      <label className="ticker-node__label">
        Tickers
        <textarea
          className="nodrag"
          value={tickers}
          rows={2}
          onChange={(event) => setTickers(event.target.value)}
          onBlur={commitTickers}
          aria-label="Ticker symbols"
          disabled={nodeData.missing}
        />
      </label>

      <div className="ticker-node__actions">
        <button
          className="nodrag"
          type="button"
          disabled={nodeData.status === 'loading' || nodeData.missing}
          onClick={() => nodeData.onRefresh?.(id)}
        >
          {nodeData.status === 'loading' ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {nodeData.errors.length > 0 ? (
        <div className="errors">
          {nodeData.errors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      ) : null}

      <PerformanceTable rows={nodeData.rows} />
    </article>
  );
}

export const TickerListNode = memo(TickerListNodeComponent);
