import { useState } from 'react';
import type { PerformanceRow } from '../api/watchlists';
import { parseTickers } from '../storage/savedLists';
import { useModifierZoom } from '../canvas/useModifierZoom';
import { CloseIcon, PlusIcon } from './icons';

type PerformanceTableProps = {
  rows: PerformanceRow[];
  /** When set, the table is always shown and a footer row lets users add tickers. */
  onAddTicker?: (raw: string) => void;
  onRemoveTicker?: (ticker: string) => void;
};

const performanceColumns = [
  ['1D', 'change1d', 'change1dClass'],
  ['5D', 'change5d', 'change5dClass'],
  ['2W', 'change2w', 'change2wClass'],
  ['1M', 'change1m', 'change1mClass'],
  ['3M', 'change3m', 'change3mClass'],
  ['6M', 'change6m', 'change6mClass'],
  ['1Y', 'change1y', 'change1yClass'],
  ['5Y', 'change5y', 'change5yClass'],
] as const;

const COLUMN_COUNT = 3 + performanceColumns.length;

export function PerformanceTable({ rows, onAddTicker, onRemoveTicker }: PerformanceTableProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useModifierZoom<HTMLDivElement>();

  function submitAdd() {
    const trimmed = draft.trim();
    if (!trimmed || !onAddTicker) {
      return;
    }
    onAddTicker(trimmed);
    setDraft('');
  }

  if (rows.length === 0 && !onAddTicker) {
    return <div className="empty">No stock data to display yet.</div>;
  }

  return (
    <div className="table-wrap nodrag nowheel" ref={scrollRef}>
      <table className="performance-table" aria-label="Watchlist performance">
        <thead>
          <tr>
            <th scope="col">Ticker</th>
            <th scope="col">Price</th>
            <th scope="col">Mkt Cap</th>
            {performanceColumns.map(([label]) => (
              <th scope="col" key={label}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={COLUMN_COUNT} className="performance-table__empty-hint">
                Nothing loaded yet — add a ticker below to pull its performance.
              </td>
            </tr>
          ) : null}
          {rows.map((row) => (
            <tr key={row.ticker}>
              <td>
                <div className="performance-table__ticker">
                  <strong>{row.ticker}</strong>
                  {onRemoveTicker ? (
                    <button
                      type="button"
                      className="performance-table__remove nodrag"
                      aria-label={`Remove ${row.ticker}`}
                      title={`Remove ${row.ticker}`}
                      onClick={() => onRemoveTicker(row.ticker)}
                    >
                      <CloseIcon />
                    </button>
                  ) : null}
                </div>
              </td>
              <td>{row.price}</td>
              <td>{row.marketCap}</td>
              {performanceColumns.map(([label, valueKey, classKey]) => (
                <td key={label} className={row[classKey]}>
                  {row[valueKey]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {onAddTicker ? (
          <tfoot>
            <tr className="performance-table__add-row">
              <td colSpan={COLUMN_COUNT}>
                <div className="performance-table__add-wrap nodrag">
                  <input
                    className="performance-table__add-input"
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label="Ticker symbol to add"
                    placeholder="Add ticker…"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        submitAdd();
                      }
                    }}
                  />
                  <button
                    className="performance-table__add-button nodrag"
                    type="button"
                    disabled={!parseTickers(draft).length}
                    onClick={submitAdd}
                  >
                    <PlusIcon />
                    Add
                  </button>
                </div>
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
