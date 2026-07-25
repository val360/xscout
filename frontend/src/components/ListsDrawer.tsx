import { useEffect, useMemo, useRef, useState } from 'react';
import { LIST_DRAG_MIME } from '../canvas/constants';
import { useLists } from '../lists/ListsContext';
import { usePreferences } from '../prefs/PreferencesContext';
import { DRAWER_MAX_WIDTH, DRAWER_MIN_WIDTH } from '../storage/preferences';
import { parseTickers } from '../storage/savedLists';
import { PlusIcon, SearchIcon, TargetIcon, TrashIcon } from './icons';

type ListsDrawerProps = {
  pinnedListIds: Set<string>;
  onAddToCanvas: (listId: string, tickers: string[]) => void;
  onFocusList: (listId: string) => void;
};

const DEFAULT_NEW_TICKERS = 'AAPL, MSFT, NVDA';

export function ListsDrawer({ pinnedListIds, onAddToCanvas, onFocusList }: ListsDrawerProps) {
  const { status, error, lists, createList, removeList, refresh } = useLists();
  const { drawerWidth, setDrawerWidth } = usePreferences();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTickers, setNewTickers] = useState(DEFAULT_NEW_TICKERS);
  const [createError, setCreateError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const visibleLists = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return lists;
    }
    return lists.filter(
      (list) =>
        list.name.toLowerCase().includes(needle) ||
        list.tickers.some((ticker) => ticker.toLowerCase().includes(needle)),
    );
  }, [lists, query]);

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
      const created = await createList({ name: trimmed, tickers: parseTickers(newTickers) });
      onAddToCanvas(created.id, created.tickers);
      setNewName('');
      setNewTickers(DEFAULT_NEW_TICKERS);
      setCreating(false);
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : 'Could not create list.');
    } finally {
      setBusy(false);
    }
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = drawerWidth;
    handle.setPointerCapture(event.pointerId);

    function onMove(moveEvent: PointerEvent) {
      const next = Math.min(
        DRAWER_MAX_WIDTH,
        Math.max(DRAWER_MIN_WIDTH, startWidth + (moveEvent.clientX - startX)),
      );
      setDrawerWidth(next);
    }
    function onUp() {
      handle.releasePointerCapture(event.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
    }
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  }

  return (
    <aside className="drawer" style={{ width: drawerWidth }} aria-label="Ticker lists library">
      <div className="drawer__inner">
        <header className="drawer__header">
          <h2>
            Lists <span className="chip">{lists.length}</span>
          </h2>
          <button
            type="button"
            className="button button--primary button--sm"
            onClick={() => setCreating((current) => !current)}
            disabled={status === 'unavailable'}
          >
            <PlusIcon />
            New
          </button>
        </header>

        <div className="drawer__search">
          <SearchIcon />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Search lists or tickers"
            aria-label="Search lists"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setQuery('');
                event.currentTarget.blur();
              }
            }}
          />
          <kbd>/</kbd>
        </div>

        {creating ? (
          <form className="drawer__create" onSubmit={submitNewList}>
            <label className="field">
              <span>Name</span>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="e.g. Megacaps"
                aria-label="New list name"
                autoFocus
              />
            </label>
            <label className="field">
              <span>Tickers</span>
              <textarea
                value={newTickers}
                onChange={(event) => setNewTickers(event.target.value)}
                rows={2}
                aria-label="New list tickers"
              />
            </label>
            {createError ? <div className="banner banner--error">{createError}</div> : null}
            <div className="drawer__create-actions">
              <button type="submit" className="button button--primary" disabled={busy}>
                {busy ? 'Saving…' : 'Create + add'}
              </button>
              <button
                type="button"
                className="button button--ghost"
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
        ) : null}

        {status === 'unavailable' ? (
          <p className="banner banner--warning">
            Server storage is offline. Set <code>DATABASE_URL</code> on the server to enable lists.
          </p>
        ) : null}
        {status === 'error' && error ? (
          <div className="banner banner--error">
            <div>{error}</div>
            <button type="button" className="button button--ghost button--sm" onClick={() => void refresh()}>
              Retry
            </button>
          </div>
        ) : null}

        <ul className="drawer__items">
          {status === 'loading' && lists.length === 0 ? (
            <li className="drawer__empty">Loading…</li>
          ) : null}
          {status === 'ready' && lists.length === 0 ? (
            <li className="drawer__empty">No lists yet. Create your first one above.</li>
          ) : null}
          {lists.length > 0 && visibleLists.length === 0 ? (
            <li className="drawer__empty">No list matches “{query.trim()}”.</li>
          ) : null}
          {visibleLists.map((list) => {
            const pinned = pinnedListIds.has(list.id);
            const confirming = pendingDelete === list.id;
            return (
              <li
                key={list.id}
                className={`drawer__item${pinned ? ' is-pinned' : ''}`}
                draggable={!confirming}
                onDragStart={(event) => {
                  event.dataTransfer.setData(LIST_DRAG_MIME, list.id);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                title={list.tickers.join(', ') || 'No tickers yet'}
              >
                <div className="drawer__item-text">
                  <strong>{list.name}</strong>
                  <span>
                    {list.tickers.length} ticker{list.tickers.length === 1 ? '' : 's'}
                    {list.tickers.length > 0 ? ` · ${list.tickers.slice(0, 3).join(' ')}` : ''}
                    {list.tickers.length > 3 ? ' …' : ''}
                  </span>
                </div>

                {confirming ? (
                  <div className="drawer__item-actions">
                    <button
                      type="button"
                      className="button button--danger button--sm"
                      onClick={() => {
                        setPendingDelete(null);
                        void removeList(list.id);
                      }}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="button button--ghost button--sm"
                      onClick={() => setPendingDelete(null)}
                    >
                      Keep
                    </button>
                  </div>
                ) : (
                  <div className="drawer__item-actions">
                    {pinned ? (
                      <button
                        type="button"
                        className="icon-button"
                        title="Centre the canvas on this list"
                        aria-label={`Show ${list.name} on the canvas`}
                        onClick={() => onFocusList(list.id)}
                      >
                        <TargetIcon />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button button--sm"
                        title="Add to canvas (or drag onto it)"
                        onClick={() => onAddToCanvas(list.id, list.tickers)}
                      >
                        Add
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-button icon-button--danger"
                      onClick={() => setPendingDelete(list.id)}
                      aria-label={`Delete ${list.name}`}
                      title="Delete list"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <p className="drawer__hint">Drag a list onto the canvas to place it exactly where you want.</p>
      </div>

      <div
        className="drawer__resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize lists panel"
        onPointerDown={startResize}
        onDoubleClick={() => setDrawerWidth(304)}
      />
    </aside>
  );
}
