import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node as FlowNode,
  type Viewport,
  type XYPosition,
} from '@xyflow/react';
import { fetchWatchlistPerformance, type PerformanceRow } from './api/watchlists';
import { NodeActionsProvider, type NodeActions } from './canvas/NodeActionsContext';
import {
  DEFAULT_NODE_WIDTH,
  ESTIMATED_NODE_HEIGHT,
  LIST_DRAG_MIME,
  MAX_ZOOM,
  MIN_ZOOM,
  NODE_GAP,
  VIEWPORT_TWEEN_MS,
} from './canvas/constants';
import { CanvasControls } from './components/CanvasControls';
import { ListsDrawer } from './components/ListsDrawer';
import { TickerListNode, type TickerListNodeData } from './components/TickerListNode';
import { TopBar } from './components/TopBar';
import { ListsProvider, useLists } from './lists/ListsContext';
import { PreferencesProvider, usePreferences } from './prefs/PreferencesContext';
import {
  clearLegacyCanvas,
  loadCanvas,
  loadLegacyCanvas,
  parseTickers,
  saveCanvas,
  type CanvasNode,
  type StoredCanvas,
} from './storage/savedLists';

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };
const SAVE_DEBOUNCE_MS = 400;

const EMPTY_TICKERS: string[] = [];
const EMPTY_ROWS: PerformanceRow[] = [];
const EMPTY_ERRORS: string[] = [];

type RenderedNode = FlowNode<TickerListNodeData, 'tickerList'>;

function createNodeId(): string {
  if ('randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createCanvasNode(listId: string, position: XYPosition): CanvasNode {
  return {
    id: createNodeId(),
    type: 'tickerList',
    position,
    style: { width: DEFAULT_NODE_WIDTH },
    // Display state is hydrated each render from the lists context.
    data: {
      listId,
      name: '',
      tickers: [],
      rows: [],
      errors: [],
      status: 'idle',
    },
  };
}

/** Guarantees a width so nodes never collapse before React Flow measures them. */
function withDefaultSize(node: CanvasNode): CanvasNode {
  if (node.style?.width !== undefined) {
    return node;
  }
  return { ...node, style: { ...node.style, width: DEFAULT_NODE_WIDTH } };
}

function serializeNodes(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    style: node.style,
    data: {
      listId: node.data.listId,
      name: node.data.name,
      tickers: node.data.tickers,
      rows: node.data.rows,
      errors: node.data.errors,
      status: node.data.status,
      updatedAt: node.data.updatedAt,
    },
  }));
}

function getInitialCanvas(): StoredCanvas {
  const stored = loadCanvas();
  if (stored) {
    return { ...stored, nodes: stored.nodes.map(withDefaultSize) };
  }
  return { nodes: [], edges: [] as Edge[], viewport: undefined };
}

/** Cheap structural comparison so cached node data can keep its identity. */
function sameNodeData(a: TickerListNodeData, b: TickerListNodeData): boolean {
  return (
    a.listId === b.listId &&
    a.name === b.name &&
    a.tickers === b.tickers &&
    a.rows === b.rows &&
    a.errors === b.errors &&
    a.status === b.status &&
    a.updatedAt === b.updatedAt &&
    a.missing === b.missing
  );
}

const nodeTypes = {
  tickerList: TickerListNode,
};

function Workspace() {
  const initialCanvas = useMemo(getInitialCanvas, []);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(initialCanvas.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialCanvas.edges);
  const [dropActive, setDropActive] = useState(false);

  const { drawerOpen, scrollMode, showMinimap, resolvedTheme } = usePreferences();
  const listsApi = useLists();
  const { status: listsStatus, lists, listsById } = listsApi;
  const {
    screenToFlowPosition,
    setCenter,
    getNode,
    getNodes,
    getZoom,
    zoomIn,
    zoomOut,
    zoomTo,
    fitView,
  } = useReactFlow();

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef(nodes);
  const listsApiRef = useRef(listsApi);
  const viewportRef = useRef<Viewport>(initialCanvas.viewport ?? DEFAULT_VIEWPORT);
  const migrationAttempted = useRef(false);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    listsApiRef.current = listsApi;
  }, [listsApi]);

  // ---------------------------------------------------------------- persistence

  const persistRef = useRef({ nodes, edges });
  const saveTimer = useRef<number | null>(null);

  const flushSave = useCallback(() => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    saveCanvas({
      nodes: serializeNodes(persistRef.current.nodes),
      edges: persistRef.current.edges,
      viewport: viewportRef.current,
    });
  }, []);

  // Dragging, resizing and panning all fire a stream of changes; writing the
  // whole canvas to localStorage on each one stalls the interaction.
  const scheduleSave = useCallback(() => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
    }
    saveTimer.current = window.setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  useEffect(() => {
    persistRef.current = { nodes, edges };
    scheduleSave();
  }, [edges, nodes, scheduleSave]);

  useEffect(() => {
    function onHide() {
      if (saveTimer.current !== null) {
        flushSave();
      }
    }
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      onHide();
    };
  }, [flushSave]);

  // ------------------------------------------------------------- node mutations

  const patchNodeData = useCallback(
    (nodeId: string, changes: Partial<TickerListNodeData>) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...changes } } : node,
        ),
      );
    },
    [setNodes],
  );

  const refreshNode = useCallback(
    async (nodeId: string, tickersOverride?: string[]) => {
      const target = nodesRef.current.find((node) => node.id === nodeId);
      const tickers =
        tickersOverride ??
        (target ? listsApiRef.current.listsById[target.data.listId]?.tickers ?? [] : []);

      patchNodeData(nodeId, { errors: EMPTY_ERRORS, status: 'loading' });

      if (tickers.length === 0) {
        patchNodeData(nodeId, {
          rows: EMPTY_ROWS,
          errors: ['Add at least one ticker to load performance.'],
          status: 'error',
        });
        return;
      }

      try {
        const result = await fetchWatchlistPerformance(tickers);
        patchNodeData(nodeId, {
          rows: result.rows,
          errors: result.errors,
          status: result.errors.length > 0 ? 'error' : 'ready',
          updatedAt: Date.now(),
        });
      } catch (error) {
        patchNodeData(nodeId, {
          rows: EMPTY_ROWS,
          errors: [error instanceof Error ? error.message : 'Unable to refresh performance.'],
          status: 'error',
        });
      }
    },
    [patchNodeData],
  );

  const removeNodeFromCanvas = useCallback(
    (nodeId: string) => {
      setNodes((current) => current.filter((node) => node.id !== nodeId));
      setEdges((current) =>
        current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      );
    },
    [setEdges, setNodes],
  );

  const commitTickers = useCallback(
    (nodeId: string, listId: string, tickers: string[]) => {
      void (async () => {
        try {
          const updated = await listsApiRef.current.setTickers(listId, tickers);
          if (updated) {
            await refreshNode(nodeId, updated.tickers);
          }
        } catch (error) {
          patchNodeData(nodeId, {
            errors: [error instanceof Error ? error.message : 'Unable to update tickers.'],
            status: 'error',
          });
        }
      })();
    },
    [patchNodeData, refreshNode],
  );

  const focusNode = useCallback(
    (nodeId: string) => {
      const node = getNode(nodeId);
      if (!node) {
        return;
      }
      const width = node.measured?.width ?? DEFAULT_NODE_WIDTH;
      const height = node.measured?.height ?? ESTIMATED_NODE_HEIGHT;
      setNodes((current) =>
        current.map((entry) =>
          entry.selected === (entry.id === nodeId)
            ? entry
            : { ...entry, selected: entry.id === nodeId },
        ),
      );
      setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: Math.max(getZoom(), 0.75),
        duration: 380,
      });
    },
    [getNode, getZoom, setCenter, setNodes],
  );

  /**
   * Walks a grid outwards from the top-left of the visible area and returns the
   * first slot that does not collide with an existing card, so adding several
   * lists in a row lays them out side by side instead of stacking them.
   */
  const nextFreePosition = useCallback((): XYPosition => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const origin = screenToFlowPosition({
      x: (rect?.left ?? 0) + 48,
      y: (rect?.top ?? 0) + 48,
    });

    const occupied = getNodes().map((node) => ({
      x: node.position.x,
      y: node.position.y,
      width: node.measured?.width ?? (Number(node.style?.width) || DEFAULT_NODE_WIDTH),
      height: node.measured?.height ?? ESTIMATED_NODE_HEIGHT,
    }));

    const stepX = DEFAULT_NODE_WIDTH + NODE_GAP;
    const stepY = ESTIMATED_NODE_HEIGHT + NODE_GAP;

    // Two columns keeps a growing canvas roughly square, so "fit view" lands on
    // a zoom level where the tables are still readable.
    for (let row = 0; row < 40; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        const candidate = { x: origin.x + column * stepX, y: origin.y + row * stepY };
        const collides = occupied.some(
          (node) =>
            candidate.x < node.x + node.width + NODE_GAP &&
            candidate.x + DEFAULT_NODE_WIDTH + NODE_GAP > node.x &&
            candidate.y < node.y + node.height + NODE_GAP &&
            candidate.y + ESTIMATED_NODE_HEIGHT + NODE_GAP > node.y,
        );
        if (!collides) {
          return candidate;
        }
      }
    }
    return origin;
  }, [getNodes, screenToFlowPosition]);

  const addListToCanvas = useCallback(
    (listId: string, tickers: string[], position?: XYPosition) => {
      const existing = nodesRef.current.find((node) => node.data.listId === listId);
      if (existing) {
        focusNode(existing.id);
        return;
      }
      const newNode = createCanvasNode(listId, position ?? nextFreePosition());
      setNodes((current) =>
        current.some((node) => node.data.listId === listId) ? current : [...current, newNode],
      );
      void refreshNode(newNode.id, tickers);
    },
    [focusNode, nextFreePosition, refreshNode, setNodes],
  );

  const refreshAll = useCallback(() => {
    for (const node of nodesRef.current) {
      void refreshNode(node.id);
    }
  }, [refreshNode]);

  const nodeActions = useMemo<NodeActions>(
    () => ({
      refresh: (nodeId) => {
        void refreshNode(nodeId);
      },
      remove: removeNodeFromCanvas,
      rename: (listId, name) => {
        void listsApiRef.current.renameList(listId, name).catch((error: unknown) => {
          console.error('Failed to rename list', error);
        });
      },
      addTickers: (nodeId, listId, raw) => {
        const parsed = parseTickers(raw);
        if (parsed.length === 0) {
          return;
        }
        const current = listsApiRef.current.listsById[listId]?.tickers ?? [];
        const merged = [...current];
        for (const ticker of parsed) {
          if (!merged.includes(ticker)) {
            merged.push(ticker);
          }
        }
        if (merged.length === current.length) {
          return;
        }
        commitTickers(nodeId, listId, merged);
      },
      removeTicker: (nodeId, listId, ticker) => {
        const current = listsApiRef.current.listsById[listId]?.tickers ?? [];
        const next = current.filter((entry) => entry !== ticker);
        if (next.length === current.length) {
          return;
        }
        commitTickers(nodeId, listId, next);
      },
    }),
    [commitTickers, refreshNode, removeNodeFromCanvas],
  );

  // -------------------------------------------------------------- housekeeping

  // One-time v1 -> v2 migration: if a legacy canvas exists with inline
  // name/tickers, upload each node as a server list, replace the nodes
  // with id-only references, and clear the legacy key.
  useEffect(() => {
    if (migrationAttempted.current || listsStatus !== 'ready') {
      return;
    }
    migrationAttempted.current = true;

    const legacy = loadLegacyCanvas();
    if (!legacy) {
      return;
    }

    void (async () => {
      const migratedNodes: CanvasNode[] = [];
      for (const legacyNode of legacy.nodes) {
        const name = (legacyNode.data?.name ?? 'Untitled list').toString();
        const tickers = Array.isArray(legacyNode.data?.tickers)
          ? (legacyNode.data?.tickers as string[])
          : [];
        try {
          const created = await listsApiRef.current.createList({ name, tickers });
          migratedNodes.push({
            id: legacyNode.id ?? createNodeId(),
            type: 'tickerList',
            position: legacyNode.position,
            style: legacyNode.style ?? { width: DEFAULT_NODE_WIDTH },
            data: {
              listId: created.id,
              name: created.name,
              tickers: created.tickers,
              rows: [],
              errors: [],
              status: 'idle',
            },
          });
        } catch (caught) {
          console.error('Failed to migrate legacy list', name, caught);
        }
      }
      if (migratedNodes.length > 0) {
        setNodes(migratedNodes);
        setEdges(legacy.edges ?? []);
      }
      clearLegacyCanvas();
    })();
  }, [listsStatus, setEdges, setNodes]);

  // Drop canvas nodes whose underlying server list has been deleted, but
  // only once we've successfully loaded the list catalog (so a network
  // blip can't wipe the canvas).
  useEffect(() => {
    if (listsStatus !== 'ready') {
      return;
    }
    setNodes((current) => {
      const alive = current.filter((node) => listsById[node.data.listId] !== undefined);
      return alive.length === current.length ? current : alive;
    });
  }, [listsStatus, listsById, setNodes]);

  // ------------------------------------------------------------------ rendering

  const renderCache = useRef(
    new Map<string, { source: CanvasNode; data: TickerListNodeData; node: RenderedNode }>(),
  );

  const renderedNodes = useMemo<RenderedNode[]>(() => {
    const cache = renderCache.current;
    const seen = new Set<string>();

    const result = nodes.map((node) => {
      seen.add(node.id);
      const list = listsById[node.data.listId];
      const next: TickerListNodeData = {
        listId: node.data.listId,
        name: list?.name ?? node.data.name ?? 'Missing list',
        tickers: list?.tickers ?? node.data.tickers ?? EMPTY_TICKERS,
        rows: node.data.rows ?? EMPTY_ROWS,
        errors: node.data.errors ?? EMPTY_ERRORS,
        status: node.data.status ?? 'idle',
        updatedAt: node.data.updatedAt,
        missing: list === undefined,
      };

      const cached = cache.get(node.id);
      const dataUnchanged = cached !== undefined && sameNodeData(cached.data, next);
      if (cached !== undefined && dataUnchanged && cached.source === node) {
        return cached.node;
      }

      const data = dataUnchanged && cached ? cached.data : next;
      const rendered: RenderedNode = { ...node, data };
      cache.set(node.id, { source: node, data, node: rendered });
      return rendered;
    });

    for (const key of [...cache.keys()]) {
      if (!seen.has(key)) {
        cache.delete(key);
      }
    }
    return result;
  }, [listsById, nodes]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((current) => addEdge(connection, current)),
    [setEdges],
  );

  const handleMoveStart = useCallback(() => {
    canvasRef.current?.classList.add('is-moving');
  }, []);

  // Marking the canvas mid-drag lets CSS switch off hover highlights and
  // hit-testing on the cards you are not dragging.
  const handleNodeDragStart = useCallback(() => {
    canvasRef.current?.classList.add('is-dragging');
  }, []);

  const handleNodeDragStop = useCallback(() => {
    canvasRef.current?.classList.remove('is-dragging');
  }, []);

  const handleMoveEnd = useCallback(
    (_event: unknown, nextViewport: Viewport) => {
      canvasRef.current?.classList.remove('is-moving');
      viewportRef.current = nextViewport;
      scheduleSave();
    },
    [scheduleSave],
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes(LIST_DRAG_MIME)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDropActive(true);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      setDropActive(false);
      const listId = event.dataTransfer.getData(LIST_DRAG_MIME);
      if (!listId) {
        return;
      }
      event.preventDefault();
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addListToCanvas(listId, listsApiRef.current.listsById[listId]?.tickers ?? [], {
        x: point.x - DEFAULT_NODE_WIDTH / 2,
        y: point.y - 28,
      });
    },
    [addListToCanvas, screenToFlowPosition],
  );

  const canvasHasContent = nodes.length > 0;
  const anyLoading = useMemo(
    () => nodes.some((node) => node.data.status === 'loading'),
    [nodes],
  );
  // Keyed on the list ids rather than on `nodes` so dragging a card does not
  // hand the drawer a brand new Set on every frame.
  const pinnedKey = nodes
    .map((node) => node.data.listId)
    .sort()
    .join(',');
  const pinnedListIds = useMemo(
    () => new Set(pinnedKey ? pinnedKey.split(',') : []),
    [pinnedKey],
  );

  const focusList = useCallback(
    (listId: string) => {
      const node = nodesRef.current.find((entry) => entry.data.listId === listId);
      if (node) {
        focusNode(node.id);
      }
    },
    [focusNode],
  );

  // Canvas-wide keyboard shortcuts. Typing in a field never triggers them.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) {
        return;
      }
      const tween = { duration: VIEWPORT_TWEEN_MS };
      switch (event.key) {
        case 'r':
        case 'R':
          refreshAll();
          break;
        case 'f':
        case 'F':
          fitView({ padding: 0.15, duration: 320 });
          break;
        case '+':
        case '=':
          zoomIn(tween);
          break;
        case '-':
        case '_':
          zoomOut(tween);
          break;
        case '0':
          zoomTo(1, tween);
          break;
        default:
          return;
      }
      event.preventDefault();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fitView, refreshAll, zoomIn, zoomOut, zoomTo]);

  return (
    <div className="app-shell">
      <TopBar nodeCount={nodes.length} busy={anyLoading} onRefreshAll={refreshAll} />

      <div className="workspace">
        {drawerOpen ? (
          <ListsDrawer
            pinnedListIds={pinnedListIds}
            onAddToCanvas={addListToCanvas}
            onFocusList={focusList}
          />
        ) : null}

        <section
          className={`canvas${dropActive ? ' is-drop-target' : ''}`}
          aria-label="Ticker list canvas"
          ref={canvasRef}
          onDragOver={handleDragOver}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDropActive(false);
            }
          }}
          onDrop={handleDrop}
        >
          <NodeActionsProvider actions={nodeActions}>
            <ReactFlow
              nodes={renderedNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onMoveStart={handleMoveStart}
              onMoveEnd={handleMoveEnd}
              onNodeDragStart={handleNodeDragStart}
              onNodeDragStop={handleNodeDragStop}
              defaultViewport={initialCanvas.viewport ?? DEFAULT_VIEWPORT}
              fitView={initialCanvas.viewport === undefined && initialCanvas.nodes.length > 0}
              fitViewOptions={{ padding: 0.15 }}
              colorMode={resolvedTheme}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              zoomOnScroll={scrollMode === 'zoom'}
              panOnScroll={scrollMode === 'pan'}
              panOnScrollSpeed={0.75}
              zoomOnPinch
              zoomOnDoubleClick={false}
              panOnDrag={[0, 1]}
              selectNodesOnDrag={false}
              nodeDragThreshold={2}
              elevateNodesOnSelect
              deleteKeyCode={['Delete']}
              proOptions={{ hideAttribution: false }}
              attributionPosition="bottom-right"
            >
              <Background gap={22} size={1.6} variant={BackgroundVariant.Dots} />
              <CanvasControls canFitView={canvasHasContent} />
              {showMinimap && canvasHasContent ? (
                <MiniMap pannable zoomable nodeBorderRadius={4} ariaLabel="Canvas minimap" />
              ) : null}
            </ReactFlow>
          </NodeActionsProvider>

          {!canvasHasContent && listsStatus !== 'loading' ? (
            <div className="canvas__placeholder">
              <h2>{lists.length === 0 ? 'No lists yet' : 'Your canvas is empty'}</h2>
              <p>
                {lists.length === 0
                  ? 'Create a list in the panel on the left, and it lands here automatically.'
                  : 'Drag a list from the panel onto the canvas, or press Add to drop one in.'}
              </p>
              <p className="canvas__placeholder-keys">
                <kbd>Scroll</kbd> zoom · <kbd>Drag</kbd> pan · <kbd>F</kbd> fit · <kbd>R</kbd>{' '}
                refresh all
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <PreferencesProvider>
      <ListsProvider>
        <Workspace />
      </ListsProvider>
    </PreferencesProvider>
  );
}
