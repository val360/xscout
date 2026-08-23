import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchWattsDashboard,
  type WattsDashboardResponse,
  type WattsInstrumentRow,
  type WattsMetric,
  type WattsPanel,
  type WattsSpread,
} from '../api/watts';
import { useLists } from '../lists/ListsContext';
import { PlusIcon, RefreshIcon } from './icons';

const TABLE_WINDOWS = ['1D', '1M', '3M', '1Y'] as const;

type WattsDashboardProps = {
  refreshToken: number;
  onBusyChange: (busy: boolean) => void;
};

export function WattsDashboard({ refreshToken, onBusyChange }: WattsDashboardProps) {
  const listsApi = useLists();
  const [data, setData] = useState<WattsDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    async (refresh: boolean) => {
      setLoading(true);
      onBusyChange(true);
      setError(null);
      try {
        const payload = await fetchWattsDashboard(refresh);
        setData(payload);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to load the Watts dashboard.');
      } finally {
        setLoading(false);
        onBusyChange(false);
      }
    },
    [onBusyChange],
  );

  useEffect(() => {
    void load(refreshToken > 0);
  }, [load, refreshToken]);

  const generatedLabel = useMemo(() => formatGeneratedAt(data?.generatedAt), [data?.generatedAt]);

  async function addPanelAsList(panel: WattsPanel) {
    const name = `Watts · ${panel.title}`;
    const existing = listsApi.lists.find((entry) => entry.name === name);
    if (existing) {
      setNotice(`“${name}” is already in your lists. Open Canvas to pin it.`);
      return;
    }
    try {
      await listsApi.createList({ name, tickers: panel.tickers });
      setNotice(`Saved “${name}” to your lists. Open Canvas to pin it.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not save that list.');
    }
  }

  const listsReady = listsApi.status === 'ready';

  return (
    <main className="watts" aria-label="Watts Into Thoughts dashboard">
      <div className="watts__inner">
        <header className="watts__hero">
          <p className="watts__kicker">What to watch</p>
          <h2>Electrons into thought</h2>
          <p className="watts__lede">
            {data?.northStar.lede ??
              'Electricity prices, grid queues, transformer lead times, financing, surplus power, and the cost of operating data centers — and above all, useful intelligence per unit of energy.'}
          </p>
          <p className="watts__meta">
            {generatedLabel ? `Quotes as of ${generatedLabel}` : loading ? 'Loading live proxies…' : 'Live proxies'}
            <span aria-hidden="true"> · </span>
            Yahoo Finance total returns, not official MWh or token statistics
          </p>
        </header>

        {error ? (
          <div className="banner banner--error" role="alert">
            {error}
          </div>
        ) : null}

        {data?.errors && data.errors.length > 0 ? (
          <div className="banner banner--warning" role="status">
            Some proxies did not load: {data.errors.join(' ')}
          </div>
        ) : null}

        {notice ? (
          <div className="banner watts__notice" role="status">
            {notice}
            <button type="button" className="button button--ghost button--sm" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>
        ) : null}

        {loading && !data ? <WattsSkeleton /> : null}

        {data ? (
          <>
            <section className="watts__spreads" aria-label="North-star spreads">
              {data.northStar.spreads.map((spread) => (
                <SpreadCard key={spread.id} spread={spread} />
              ))}
            </section>

            {data.panels.map((panel) => (
              <section key={panel.id} className="watts-panel" id={panel.id}>
                <header className="watts-panel__header">
                  <div>
                    <h3>{panel.title}</h3>
                    <p>{panel.watch}</p>
                  </div>
                  {listsReady ? (
                    <button
                      type="button"
                      className="button button--sm"
                      onClick={() => void addPanelAsList(panel)}
                      title="Save these tickers as a canvas list"
                    >
                      <PlusIcon />
                      Save as list
                    </button>
                  ) : null}
                </header>

                {panel.metrics.length > 0 ? (
                  <div className="watts-metrics">
                    {panel.metrics.map((metric) => (
                      <MetricCard key={metric.id} metric={metric} />
                    ))}
                  </div>
                ) : null}

                <ProxyTable rows={panel.rows} />
              </section>
            ))}

            <footer className="watts__footer">
              <p>{data.thesis}</p>
              <p>{data.sourceNote}</p>
            </footer>
          </>
        ) : null}
      </div>
    </main>
  );
}

function SpreadCard({ spread }: { spread: WattsSpread }) {
  const headline = spread.windows['1M'] ?? emptyCell();
  return (
    <article className="watts-spread">
      <h3>{spread.label}</h3>
      <p className={`watts-spread__value ${headline.className}`}>{headline.display}</p>
      <p className="watts-spread__window">1-month listed-market spread</p>
      <p className="watts-spread__copy">{spread.description}</p>
      <dl className="watts-spread__windows">
        {TABLE_WINDOWS.map((label) => {
          const cell = spread.windows[label] ?? emptyCell();
          return (
            <div key={label}>
              <dt>{label}</dt>
              <dd className={cell.className}>{cell.display}</dd>
            </div>
          );
        })}
      </dl>
    </article>
  );
}

function MetricCard({ metric }: { metric: WattsMetric }) {
  return (
    <article className="watts-metric">
      <h4>{metric.label}</h4>
      <p className="watts-metric__value">{metric.value}</p>
      <p className="watts-metric__detail">{metric.detail}</p>
      <p className="watts-metric__source">
        {metric.asOf}
        <span aria-hidden="true"> · </span>
        {metric.source}
      </p>
    </article>
  );
}

function ProxyTable({ rows }: { rows: WattsInstrumentRow[] }) {
  return (
    <div className="table-wrap watts-table-wrap">
      <table className="performance-table watts-table" aria-label="Market proxies">
        <thead>
          <tr>
            <th scope="col">Proxy</th>
            <th scope="col">Last</th>
            {TABLE_WINDOWS.map((label) => (
              <th scope="col" key={label}>
                {label}
              </th>
            ))}
            <th scope="col">Path</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.ticker}>
              <td>
                <div className="watts-table__name">
                  <strong>{row.ticker}</strong>
                  <span>{row.name}</span>
                  <em>{row.role}</em>
                </div>
              </td>
              <td>{row.price}</td>
              {TABLE_WINDOWS.map((label) => {
                const cell = row.windows[label];
                return (
                  <td key={label} className={cell?.className ?? ''}>
                    {cell?.display ?? 'N/A'}
                  </td>
                );
              })}
              <td>
                <Sparkline values={row.sparkline} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <span className="watts-sparkline watts-sparkline--empty">—</span>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 88;
  const height = 28;
  const pad = 1.5;
  const points = values.map((value, index) => {
    const x = pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const up = values[values.length - 1] >= values[0];
  return (
    <svg
      className={`watts-sparkline${up ? ' is-up' : ' is-down'}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
    >
      <polyline fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" points={points.join(' ')} />
    </svg>
  );
}

function WattsSkeleton() {
  return (
    <div className="watts-skeleton" aria-hidden="true">
      <div className="watts__spreads">
        <div className="watts-spread" />
        <div className="watts-spread" />
        <div className="watts-spread" />
      </div>
      <p className="watts__meta">
        <RefreshIcon className="is-spinning" /> Loading electricity, grid, credit, and compute proxies…
      </p>
    </div>
  );
}

function emptyCell() {
  return { value: null, display: 'N/A', className: '' };
}

function formatGeneratedAt(iso: string | undefined): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
