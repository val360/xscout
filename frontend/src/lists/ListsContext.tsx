import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  createTickerList,
  deleteTickerList,
  fetchTickerLists,
  patchTickerList,
  type TickerList,
} from '../api/lists';

export type ListsStatus = 'loading' | 'ready' | 'error' | 'unavailable';

type ListsContextValue = {
  status: ListsStatus;
  error: string | null;
  lists: TickerList[];
  listsById: Record<string, TickerList>;
  refresh: () => Promise<void>;
  createList: (input: { name: string; tickers: string[] }) => Promise<TickerList>;
  renameList: (id: string, name: string) => Promise<TickerList | null>;
  setTickers: (id: string, tickers: string[]) => Promise<TickerList | null>;
  removeList: (id: string) => Promise<void>;
};

const ListsContext = createContext<ListsContextValue | undefined>(undefined);

export function ListsProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ListsStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<TickerList[]>([]);
  const fetchedOnce = useRef(false);

  const refresh = useCallback(async () => {
    setStatus((current) => (current === 'ready' ? current : 'loading'));
    try {
      const result = await fetchTickerLists();
      setLists(result);
      setStatus('ready');
      setError(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to load lists.';
      // Differentiate "server has no DB" from other errors so the UI can
      // surface a calmer message and gracefully degrade.
      if (message.includes('DATABASE_URL') || message.includes('503')) {
        setStatus('unavailable');
      } else {
        setStatus('error');
      }
      setError(message);
    }
  }, []);

  useEffect(() => {
    if (fetchedOnce.current) {
      return;
    }
    fetchedOnce.current = true;
    void refresh();
  }, [refresh]);

  const createList = useCallback(
    async ({ name, tickers }: { name: string; tickers: string[] }) => {
      const created = await createTickerList({ name, tickers });
      setLists((current) => [...current, created]);
      return created;
    },
    [],
  );

  const renameList = useCallback(async (id: string, name: string) => {
    const previous = lists.find((entry) => entry.id === id);
    if (!previous || previous.name === name) {
      return previous ?? null;
    }
    // Optimistic update: paint immediately, roll back on failure.
    setLists((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, name } : entry)),
    );
    try {
      const updated = await patchTickerList(id, { name });
      setLists((current) => current.map((entry) => (entry.id === id ? updated : entry)));
      return updated;
    } catch (caught) {
      setLists((current) =>
        current.map((entry) => (entry.id === id ? previous : entry)),
      );
      throw caught;
    }
  }, [lists]);

  const setTickers = useCallback(async (id: string, tickers: string[]) => {
    const previous = lists.find((entry) => entry.id === id);
    if (!previous) {
      return null;
    }
    if (
      previous.tickers.length === tickers.length &&
      previous.tickers.every((value, index) => value === tickers[index])
    ) {
      return previous;
    }
    setLists((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, tickers } : entry)),
    );
    try {
      const updated = await patchTickerList(id, { tickers });
      setLists((current) => current.map((entry) => (entry.id === id ? updated : entry)));
      return updated;
    } catch (caught) {
      setLists((current) =>
        current.map((entry) => (entry.id === id ? previous : entry)),
      );
      throw caught;
    }
  }, [lists]);

  const removeList = useCallback(async (id: string) => {
    const previous = lists;
    setLists((current) => current.filter((entry) => entry.id !== id));
    try {
      await deleteTickerList(id);
    } catch (caught) {
      setLists(previous);
      throw caught;
    }
  }, [lists]);

  const listsById = useMemo(() => {
    const map: Record<string, TickerList> = {};
    for (const entry of lists) {
      map[entry.id] = entry;
    }
    return map;
  }, [lists]);

  const value = useMemo<ListsContextValue>(
    () => ({
      status,
      error,
      lists,
      listsById,
      refresh,
      createList,
      renameList,
      setTickers,
      removeList,
    }),
    [status, error, lists, listsById, refresh, createList, renameList, setTickers, removeList],
  );

  return <ListsContext.Provider value={value}>{children}</ListsContext.Provider>;
}

export function useLists(): ListsContextValue {
  const context = useContext(ListsContext);
  if (context === undefined) {
    throw new Error('useLists must be used within a ListsProvider.');
  }
  return context;
}
