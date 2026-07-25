import { memo, useEffect, useState } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import type { PerformanceRow } from '../api/watchlists';
import { MIN_NODE_HEIGHT, MIN_NODE_WIDTH } from '../canvas/constants';
import { useNodeActions } from '../canvas/NodeActionsContext';
import { PerformanceTable } from './PerformanceTable';
import { CloseIcon, GripIcon, RefreshIcon } from './icons';

export type TickerListStatus = 'idle' | 'loading' | 'ready' | 'error';

// Node `data` carries the layout id plus _derived_ list content (name,
// tickers) supplied by `App.tsx` from the lists context. Mutations go through
// `useNodeActions`, which keeps this object's identity stable across canvas
// interactions.
export type TickerListNodeData = {
  listId: string;
  name: string;
  tickers: string[];
  rows: PerformanceRow[];
  errors: string[];
  status: TickerListStatus;
  updatedAt?: number;
  missing?: boolean;
} & Record<string, unknown>;

function formatUpdatedAt(timestamp: number | undefined): string {
  if (!timestamp) {
    return 'Not loaded yet';
  }
  const time = new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Updated ${time}`;
}

function TickerListNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as TickerListNodeData;
  const actions = useNodeActions();
  const [name, setName] = useState(nodeData.name);

  useEffect(() => {
    setName(nodeData.name);
  }, [nodeData.name]);

  const loading = nodeData.status === 'loading';

  function commitName() {
    const cleaned = name.trim();
    if (!cleaned) {
      setName(nodeData.name);
      return;
    }
    if (cleaned === nodeData.name) {
      return;
    }
    actions.rename(nodeData.listId, cleaned);
  }

  return (
    <div className="node-shell">
      <NodeResizer minWidth={MIN_NODE_WIDTH} minHeight={MIN_NODE_HEIGHT} />
      <article className={`ticker-node${loading ? ' is-loading' : ''}`} data-selected={selected}>
        <span className="ticker-node__progress" aria-hidden="true" />

        <header className="ticker-node__header" title="Drag to move">
          <span className="ticker-node__grip" aria-hidden="true">
            <GripIcon />
          </span>
          <input
            className="ticker-node__title nodrag"
            aria-label="Ticker list name"
            value={name}
            spellCheck={false}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
              if (event.key === 'Escape') {
                setName(nodeData.name);
                event.currentTarget.blur();
              }
            }}
          />
          <span className="chip" title={nodeData.tickers.join(', ') || 'No tickers yet'}>
            {nodeData.tickers.length}
          </span>
          <div className="ticker-node__actions nodrag">
            <button
              className="icon-button"
              type="button"
              disabled={loading || nodeData.missing}
              aria-label="Refresh performance data"
              title="Refresh performance"
              onClick={() => actions.refresh(id)}
            >
              <RefreshIcon className={loading ? 'is-spinning' : undefined} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label={`Remove ${nodeData.name || 'this list'} from the canvas`}
              title="Remove from canvas (the list stays in your library)"
              onClick={() => actions.remove(id)}
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <p className="ticker-node__meta">
          {loading ? 'Refreshing…' : formatUpdatedAt(nodeData.updatedAt)}
        </p>

        {nodeData.missing ? (
          <div className="banner banner--error">This list is no longer in your library.</div>
        ) : null}

        {nodeData.errors.length > 0 ? (
          <div className="banner banner--error">
            {nodeData.errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        ) : null}

        <PerformanceTable
          rows={nodeData.rows}
          onAddTicker={
            nodeData.missing ? undefined : (raw) => actions.addTickers(id, nodeData.listId, raw)
          }
          onRemoveTicker={
            nodeData.missing
              ? undefined
              : (ticker) => actions.removeTicker(id, nodeData.listId, ticker)
          }
        />
      </article>
    </div>
  );
}

export const TickerListNode = memo(TickerListNodeComponent);
