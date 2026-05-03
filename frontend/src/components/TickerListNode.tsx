import { memo, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { PerformanceRow } from '../api/watchlists';
import { formatTickers, parseTickers } from '../storage/savedLists';
import { PerformanceTable } from './PerformanceTable';

export type TickerListStatus = 'idle' | 'loading' | 'ready' | 'error';

export type TickerListNodeData = {
  name: string;
  tickers: string[];
  rows: PerformanceRow[];
  errors: string[];
  status: TickerListStatus;
  onDelete?: (nodeId: string) => void;
  onRefresh?: (nodeId: string) => void;
  onUpdate?: (nodeId: string, updates: Partial<TickerListNodeData>) => void;
} & Record<string, unknown>;

function TickerListNodeComponent({ id, data }: NodeProps) {
  const nodeData = data as TickerListNodeData;
  const [name, setName] = useState(nodeData.name);
  const [tickers, setTickers] = useState(formatTickers(nodeData.tickers));

  function saveChanges() {
    nodeData.onUpdate?.(id, {
      name: name.trim() || 'Untitled list',
      tickers: parseTickers(tickers),
      rows: [],
      errors: [],
      status: 'idle',
    });
  }

  return (
    <article className="ticker-node">
      <header className="ticker-node__header">
        <div>
          <input
            className="ticker-node__title nodrag"
            aria-label="Ticker list name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={saveChanges}
          />
          <p>{nodeData.tickers.length} tickers</p>
        </div>
        <button className="danger-button nodrag" type="button" onClick={() => nodeData.onDelete?.(id)}>
          Delete
        </button>
      </header>

      <label className="ticker-node__label">
        Tickers
        <textarea
          className="nodrag"
          value={tickers}
          rows={2}
          onChange={(event) => setTickers(event.target.value)}
          onBlur={saveChanges}
          aria-label="Ticker symbols"
        />
      </label>

      <div className="ticker-node__actions">
        <button
          className="nodrag"
          type="button"
          disabled={nodeData.status === 'loading'}
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
