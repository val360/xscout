export type ChangeCell = {
  value: number | null;
  display: string;
  className: string;
};

export type WattsInstrumentRow = {
  ticker: string;
  name: string;
  role: string;
  kind: string;
  price: string;
  priceValue: number | null;
  windows: Record<string, ChangeCell>;
  sparkline: number[];
};

export type WattsMetric = {
  id: string;
  label: string;
  value: string;
  detail: string;
  asOf: string;
  source: string;
};

export type WattsPanel = {
  id: string;
  title: string;
  watch: string;
  tickers: string[];
  metrics: WattsMetric[];
  rows: WattsInstrumentRow[];
};

export type WattsSpread = {
  id: string;
  label: string;
  description: string;
  longTickers: string[];
  shortTickers: string[];
  windows: Record<string, ChangeCell>;
  coverage: { long: string[]; short: string[] };
};

export type WattsDashboardResponse = {
  generatedAt: string;
  title: string;
  subtitle: string;
  thesis: string;
  sourceNote: string;
  northStar: {
    title: string;
    lede: string;
    spreads: WattsSpread[];
  };
  panels: WattsPanel[];
  errors: string[];
  error?: string;
};

export async function fetchWattsDashboard(refresh = false): Promise<WattsDashboardResponse> {
  const suffix = refresh ? '?refresh=1' : '';
  const response = await fetch(`/api/watts/dashboard${suffix}`);
  const body = (await response.json().catch(() => ({}))) as WattsDashboardResponse;
  if (!response.ok) {
    throw new Error(body.error || `Watts dashboard failed with ${response.status}`);
  }
  return body;
}
