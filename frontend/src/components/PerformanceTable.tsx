import { useState } from 'react';
import type { PerformanceRow } from '../api/watchlists';
import { parseTickers } from '../storage/savedLists';

type PerformanceTableProps = {
  rows: PerformanceRow[];
  /** When set, the table is always shown and a footer row lets users add tickers. */
  onAddTicker?: (raw: string) => void;
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

export function PerformanceTable({ rows, onAddTicker }: PerformanceTableProps) {
  const [draft, setDraft] = useState('');

  if (rows.length === 0 && !onAddTicker) {
    return <div className="empty">No stock data to display yet.</div>;
  }

  function submitAdd() {
    const trimmed = draft.trim();
    if (!trimmed || !onAddTicker) {
      return;
    }
    onAddTicker(trimmed);
    setDraft('');
  }

  const emptyBody =
    rows.length === 0 ? (
      <tr>
        <td colSpan={COLUMN_COUNT} className="performance-table__empty-hint">
          No performance loaded yet. Add tickers here, then use refresh in the header.
        </td>
      </tr>
    ) : null;

  return (
    <div className="table-wrap nodrag nowheel">
      <table className="performance-table" aria-label="Watchlist performance">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Price</th>
            <th>Market Cap</th>
            {performanceColumns.map(([label]) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {emptyBody}
          {rows.map((row) => (
            <tr key={row.ticker}>
              <td>
                <strong>{row.ticker}</strong>
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
              <td>
                <div className="performance-table__add-wrap nodrag">
                  <input
                    className="performance-table__add-input"
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label="Ticker symbol to add"
                    placeholder="AAPL"
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
                    Add
                  </button>
                </div>
              </td>
              {/* {Array.from({ length: COLUMN_COUNT - 1 }, (_, index) => (
                <td key={index}>—</td>
              ))} */}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
