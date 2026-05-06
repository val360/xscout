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
] as const;

export function PerformanceTable({ rows }: PerformanceTableProps) {
  if (rows.length === 0) {
    return <div className="empty">No stock data to display yet.</div>;
  }

  return (
    <div
      className="table-wrap performance-scroll"
      tabIndex={0}
      role="region"
      aria-label="Performance table; scroll horizontally for additional periods"
    >
      <table className="performance-table">
        <colgroup>
          <col className="perf-w1" />
          <col className="perf-w2" />
          <col className="perf-w3" />
          <col className="perf-w4" />
          <col span={4} />
        </colgroup>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Price</th>
            <th>Mkt cap</th>
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
