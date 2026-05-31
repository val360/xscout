import { useState } from 'react';
import { useLists } from '../lists/ListsContext';
import { parseTickers } from '../storage/savedLists';

type ListsDrawerProps = {
  pinnedListIds: Set<string>;
  onAddToCanvas: (listId: string, tickers: string[]) => void;
  onCreateAndAdd: (listId: string, tickers: string[]) => void;
};

export function ListsDrawer({ pinnedListIds, onAddToCanvas, onCreateAndAdd }: ListsDrawerProps) {
  const { status, error, lists, createList, removeList, refresh } = useLists();
  const [open, setOpen] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTickers, setNewTickers] = useState('AAPL, MSFT, NVDA');
  const [createError, setCreateError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitNewList(event: React.FormEvent) {
    event.preventDefault();
    setCreateError(null);
    const trimmed = newName.trim();
    if (!trimmed) {
      setCreateError('Give the list a name.');
      return;
    }
    setBusy(true);
    try {
      const created = await createList({
        name: trimmed,
        tickers: parseTickers(newTickers),
      });
      onCreateAndAdd(created.id, created.tickers);
      setNewName('');
      setNewTickers('AAPL, MSFT, NVDA');
      setCreating(false);
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : 'Could not create list.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="lists-drawer__toggle"
        onClick={() => setOpen(true)}
        aria-label="Show lists library"
      >
        Lists ({lists.length})
      </button>
    );
  }

  return (
    <aside className="lists-drawer" aria-label="Ticker lists library">
      <header className="lists-drawer__header">
        <h2>Lists</h2>
        <button
          type="button"
          className="ghost-button"
          onClick={() => setOpen(false)}
          aria-label="Hide lists library"
        >
          Hide
        </button>
      </header>

      {status === 'unavailable' ? (
        <p className="lists-drawer__notice">
          Server storage is offline. Set <code>DATABASE_URL</code> on the server to enable lists.
        </p>
      ) : null}
      {status === 'error' && error ? (
        <div className="errors lists-drawer__notice">
          {error}{' '}
          <button type="button" className="ghost-button" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : null}

      <ul className="lists-drawer__items">
        {status === 'loading' && lists.length === 0 ? (
          <li className="lists-drawer__empty">Loading…</li>
        ) : null}
        {status === 'ready' && lists.length === 0 ? (
          <li className="lists-drawer__empty">No lists yet. Create your first below.</li>
        ) : null}
        {lists.map((list) => {
          const pinned = pinnedListIds.has(list.id);
          return (
            <li key={list.id} className="lists-drawer__item">
              <div className="lists-drawer__item-text">
                <strong>{list.name}</strong>
                <span>{list.tickers.length} tickers</span>
              </div>
              <div className="lists-drawer__item-actions">
                <button
                  type="button"
                  onClick={() => onAddToCanvas(list.id, list.tickers)}
                  disabled={pinned}
                  title={pinned ? 'Already on canvas' : 'Add to canvas'}
                >
                  {pinned ? 'On canvas' : 'Add'}
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    if (window.confirm(`Delete "${list.name}"? This cannot be undone.`)) {
                      void removeList(list.id);
                    }
                  }}
                  aria-label={`Delete ${list.name}`}
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="lists-drawer__create">
        {creating ? (
          <form onSubmit={submitNewList}>
            <label className="ticker-node__label">
              Name
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="e.g. Megacaps"
                aria-label="New list name"
                autoFocus
              />
            </label>
            <label className="ticker-node__label">
              Tickers
              <textarea
                value={newTickers}
                onChange={(event) => setNewTickers(event.target.value)}
                rows={2}
                aria-label="New list tickers"
              />
            </label>
            {createError ? <div className="errors">{createError}</div> : null}
            <div className="lists-drawer__create-actions">
              <button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Create + add'}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setCreating(false);
                  setCreateError(null);
                }}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={status === 'unavailable'}
          >
            + New list
          </button>
        )}
      </div>
    </aside>
  );
}
