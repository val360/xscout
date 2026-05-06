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
    <div className="table-wrap">
      <table className="performance-table">
        <thead>
          <tr>
            <th className="sticky-col sticky-col--1">Ticker</th>
            <th className="sticky-col sticky-col--2">Price</th>
            <th className="sticky-col sticky-col--3">Market Cap</th>
            {performanceColumns.map(([label], index) => (
              <th key={label} className={index === 0 ? 'sticky-col sticky-col--4' : undefined}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.ticker}>
              <td className="sticky-col sticky-col--1">
                <strong>{row.ticker}</strong>
              </td>
              <td className="sticky-col sticky-col--2">{row.price}</td>
              <td className="sticky-col sticky-col--3">{row.marketCap}</td>
              {performanceColumns.map(([label, valueKey, classKey], index) => {
                const stickyClass = index === 0 ? 'sticky-col sticky-col--4' : '';
                const valueClass = row[classKey];
                const className = [stickyClass, valueClass].filter(Boolean).join(' ');
                return (
                  <td key={label} className={className || undefined}>
                    {row[valueKey]}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
