export type PerformanceRow = {
  ticker: string;
  price: string;
  marketCap: string;
  change1d: string;
  change1dClass: string;
  change5d: string;
  change5dClass: string;
  change2w: string;
  change2wClass: string;
  change1m: string;
  change1mClass: string;
  change3m: string;
  change3mClass: string;
  change6m: string;
  change6mClass: string;
  change1y: string;
  change1yClass: string;
  change5y: string;
  change5yClass: string;
};

export type WatchlistPerformanceResponse = {
  rows: PerformanceRow[];
  errors: string[];
};

export async function fetchWatchlistPerformance(
  tickers: string[],
): Promise<WatchlistPerformanceResponse> {
  const response = await fetch('/api/watchlists/performance', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tickers }),
  });

  if (!response.ok) {
    throw new Error(`Performance request failed with ${response.status}`);
  }

  return response.json() as Promise<WatchlistPerformanceResponse>;
}
