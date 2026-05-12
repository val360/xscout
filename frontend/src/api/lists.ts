export type TickerList = {
  id: string;
  name: string;
  tickers: string[];
  createdAt: string;
  updatedAt: string;
};

type ListsResponse = { lists: TickerList[] };

async function unwrap<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    const message = typeof body.error === 'string' ? body.error : `Request failed with ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export async function fetchTickerLists(): Promise<TickerList[]> {
  const response = await fetch('/api/ticker-lists');
  const data = await unwrap<ListsResponse>(response);
  return data.lists;
}

export async function createTickerList(input: {
  name: string;
  tickers: string[];
}): Promise<TickerList> {
  const response = await fetch('/api/ticker-lists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return unwrap<TickerList>(response);
}

export async function patchTickerList(
  id: string,
  changes: { name?: string; tickers?: string[] },
): Promise<TickerList> {
  const response = await fetch(`/api/ticker-lists/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  return unwrap<TickerList>(response);
}

export async function deleteTickerList(id: string): Promise<void> {
  const response = await fetch(`/api/ticker-lists/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (response.status === 204) {
    return;
  }
  await unwrap<unknown>(response);
}
