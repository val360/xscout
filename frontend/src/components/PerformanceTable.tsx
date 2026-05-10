import type { PerformanceRow } from '../api/watchlists';

type PerformanceTableProps = {
  rows: PerformanceRow[];
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

export function PerformanceTable({ rows }: PerformanceTableProps) {
  if (rows.length === 0) {
    return <div className="empty">No stock data to display yet.</div>;
  }

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
      </table>
    </div>
  );
}
