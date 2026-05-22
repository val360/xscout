import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type Viewport,
} from '@xyflow/react';
import { fetchWatchlistPerformance } from './api/watchlists';
import { TickerListNode, type TickerListNodeData } from './components/TickerListNode';
import { ListsDrawer } from './components/ListsDrawer';
import { ListsProvider, useLists } from './lists/ListsContext';
import {
  clearLegacyCanvas,
  loadCanvas,
  loadLegacyCanvas,
  saveCanvas,
  type CanvasNode,
  type StoredCanvas,
} from './storage/savedLists';

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

function createNodeId(): string {
  if ('randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createCanvasNode(listId: string, position: { x: number; y: number }): CanvasNode {
  return {
    id: createNodeId(),
    type: 'tickerList',
    position,
    style: { width: 560 },
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

function stripCallbacks(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.map((node) => ({
    ...node,
    data: {
      listId: node.data.listId,
      name: node.data.name,
      tickers: node.data.tickers,
      rows: node.data.rows,
      errors: node.data.errors,
      status: node.data.status,
    },
  }));
}

function getInitialCanvas(): StoredCanvas {
  const stored = loadCanvas();
  if (stored) {
    return stored;
  }
  return {
    nodes: [],
    edges: [] as Edge[],
    viewport: DEFAULT_VIEWPORT,
  };
}

const nodeTypes = {
  tickerList: TickerListNode,
};

function Workspace() {
  const initialCanvas = useMemo(getInitialCanvas, []);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(initialCanvas.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialCanvas.edges);
  const [viewport, setViewport] = useState<Viewport>(initialCanvas.viewport ?? DEFAULT_VIEWPORT);
  const nodesRef = useRef(nodes);
  const migrationAttempted = useRef(false);

  const {
    status: listsStatus,
    lists,
    listsById,
    createList,
    renameList,
    setTickers,
  } = useLists();

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // One-time v1 -> v2 migration: if a legacy canvas exists with inline
  // name/tickers, upload each node as a server list, replace the nodes
  // with id-only references, and clear the legacy key.
  useEffect(() => {
    if (migrationAttempted.current) {
      return;
    }
    if (listsStatus !== 'ready') {
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
          const created = await createList({ name, tickers });
          migratedNodes.push({
            id: legacyNode.id ?? createNodeId(),
            type: 'tickerList',
            position: legacyNode.position,
            style: legacyNode.style ?? { width: 560 },
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
        setViewport(legacy.viewport ?? DEFAULT_VIEWPORT);
      }
      clearLegacyCanvas();
    })();
  }, [listsStatus, createList, setEdges, setNodes]);

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

  const removeNodeFromCanvas = useCallback(
    (nodeId: string) => {
      setNodes((current) => current.filter((node) => node.id !== nodeId));
      setEdges((current) =>
        current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      );
    },
    [setEdges, setNodes],
  );

  const refreshNode = useCallback(
    async (nodeId: string) => {
      const target = nodesRef.current.find((node) => node.id === nodeId);
      const tickers = target ? listsById[target.data.listId]?.tickers ?? [] : [];

      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, errors: [], status: 'loading' } }
            : node,
        ),
      );

      if (tickers.length === 0) {
        setNodes((current) =>
          current.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    rows: [],
                    errors: ['Enter at least one ticker to show performance.'],
                    status: 'error',
                  },
                }
              : node,
          ),
        );
        return;
      }

      try {
        const result = await fetchWatchlistPerformance(tickers);
        setNodes((current) =>
          current.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    rows: result.rows,
                    errors: result.errors,
                    status: result.errors.length > 0 ? 'error' : 'ready',
                  },
                }
              : node,
          ),
        );
      } catch (error) {
        setNodes((current) =>
          current.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    rows: [],
                    errors: [
                      error instanceof Error ? error.message : 'Unable to refresh performance.',
                    ],
                    status: 'error',
                  },
                }
              : node,
          ),
        );
      }
    },
    [listsById, setNodes],
  );

  const addListToCanvas = useCallback(
    (listId: string) => {
      setNodes((current) => {
        if (current.some((node) => node.data.listId === listId)) {
          return current;
        }
        // Tile new nodes in a 3-wide grid so consecutive lists don't pile
        // up on top of each other. Nodes are 560px wide; 600px stride
        // leaves a small gutter, and 380px row stride matches min height.
        const index = current.length;
        const columnsPerRow = 3;
        return [
          ...current,
          createCanvasNode(listId, {
            x: 80 + (index % columnsPerRow) * 600,
            y: 80 + Math.floor(index / columnsPerRow) * 380,
          }),
        ];
      });
    },
    [setNodes],
  );

  const refreshAll = useCallback(() => {
    for (const node of nodesRef.current) {
      void refreshNode(node.id);
    }
  }, [refreshNode]);

  const handleRename = useCallback(
    (listId: string, name: string) => {
      void renameList(listId, name);
    },
    [renameList],
  );

  const handleSetTickers = useCallback(
    (listId: string, tickers: string[]) => {
      void setTickers(listId, tickers);
    },
    [setTickers],
  );

  const onConnect = useCallback(
    (connection: Connection) => setEdges((current) => addEdge(connection, current)),
    [setEdges],
  );

  const renderedNodes = useMemo<Node<TickerListNodeData, 'tickerList'>[]>(
    () =>
      nodes.map((node) => {
        const list = listsById[node.data.listId];
        return {
          ...node,
          style: {
            width: 560,
            ...node.style,
          },
          data: {
            ...node.data,
            listId: node.data.listId,
            name: list?.name ?? node.data.name ?? '(Missing list)',
            tickers: list?.tickers ?? node.data.tickers ?? [],
            missing: list === undefined,
            onRemoveFromCanvas: removeNodeFromCanvas,
            onRefresh: refreshNode,
            onRename: handleRename,
            onSetTickers: handleSetTickers,
          },
        };
      }),
    [handleRename, handleSetTickers, listsById, nodes, refreshNode, removeNodeFromCanvas],
  );

  useEffect(() => {
    saveCanvas({
      nodes: stripCallbacks(nodes),
      edges,
      viewport,
    });
  }, [edges, nodes, viewport]);

  const pinnedListIds = useMemo(
    () => new Set(nodes.map((node) => node.data.listId)),
    [nodes],
  );

  const canvasHasContent = nodes.length > 0;

  return (
    <main className="app-shell">
      <aside className="toolbar" aria-label="Canvas controls">
        <div>
          <h1>xscout</h1>
          <p>Arrange ticker lists on a canvas and refresh each list's performance table.</p>
        </div>
        <div className="toolbar__actions">
          <button type="button" onClick={refreshAll} disabled={!canvasHasContent}>
            Refresh All
          </button>
        </div>
      </aside>

      <div className="workspace">
        <ListsDrawer
          pinnedListIds={pinnedListIds}
          onAddToCanvas={addListToCanvas}
          onCreateAndAdd={addListToCanvas}
        />

        <section className="canvas" aria-label="Ticker list canvas">
          {!canvasHasContent && lists.length === 0 && listsStatus === 'ready' ? (
            <div className="canvas__placeholder">
              Create your first list from the sidebar to get started.
            </div>
          ) : null}
          {!canvasHasContent && lists.length > 0 ? (
            <div className="canvas__placeholder">
              Pick a list from the sidebar and click <strong>Add</strong> to pin it here.
            </div>
          ) : null}
          <ReactFlow
            nodes={renderedNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            defaultViewport={viewport}
            onMoveEnd={(_, nextViewport) => setViewport(nextViewport)}
          >
            <Background
              color="var(--canvas-grid-color)"
              gap={24}
              variant={BackgroundVariant.Dots}
            />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </section>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <ListsProvider>
      <Workspace />
    </ListsProvider>
  );
}
