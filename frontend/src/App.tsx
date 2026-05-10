import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
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
import { loadCanvas, saveCanvas } from './storage/savedLists';

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

function createNodeId(): string {
  if ('randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `ticker-list-${Date.now()}`;
}

function createTickerNode(position: { x: number; y: number }): Node<TickerListNodeData, 'tickerList'> {
  return {
    id: createNodeId(),
    type: 'tickerList',
    position,
    style: { width: 560 },
    data: {
      name: 'New ticker list',
      tickers: ['AAPL', 'MSFT', 'NVDA'],
      rows: [],
      errors: [],
      status: 'idle',
    },
  };
}

function stripCallbacks(
  nodes: Array<Node<TickerListNodeData, 'tickerList'>>,
): Array<Node<TickerListNodeData, 'tickerList'>> {
  return nodes.map((node) => ({
    ...node,
    data: {
      name: node.data.name,
      tickers: node.data.tickers,
      rows: node.data.rows,
      errors: node.data.errors,
      status: node.data.status,
    },
  }));
}

function getInitialCanvas() {
  const savedCanvas = loadCanvas();
  if (savedCanvas) {
    return savedCanvas;
  }

  return {
    nodes: [createTickerNode({ x: 80, y: 80 })],
    edges: [] as Edge[],
    viewport: DEFAULT_VIEWPORT,
  };
}

const nodeTypes = {
  tickerList: TickerListNode,
};

export default function App() {
  const initialCanvas = useMemo(getInitialCanvas, []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialCanvas.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialCanvas.edges);
  const [viewport, setViewport] = useState<Viewport>(initialCanvas.viewport ?? DEFAULT_VIEWPORT);
  const nodesRef = useRef(nodes);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((currentNodes) => currentNodes.filter((node) => node.id !== nodeId));
      setEdges((currentEdges) =>
        currentEdges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      );
    },
    [setEdges, setNodes],
  );

  const updateNode = useCallback(
    (nodeId: string, updates: Partial<TickerListNodeData>) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...updates,
                },
              }
            : node,
        ),
      );
    },
    [setNodes],
  );

  const refreshNode = useCallback(
    async (nodeId: string) => {
      const tickers = nodesRef.current.find((node) => node.id === nodeId)?.data.tickers ?? [];

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              errors: [],
              status: 'loading',
            },
          };
        }),
      );

      if (tickers.length === 0) {
        updateNode(nodeId, {
          rows: [],
          errors: ['Enter at least one ticker to show performance.'],
          status: 'error',
        });
        return;
      }

      try {
        const result = await fetchWatchlistPerformance(tickers);
        updateNode(nodeId, {
          rows: result.rows,
          errors: result.errors,
          status: result.errors.length > 0 ? 'error' : 'ready',
        });
      } catch (error) {
        updateNode(nodeId, {
          rows: [],
          errors: [error instanceof Error ? error.message : 'Unable to refresh performance.'],
          status: 'error',
        });
      }
    },
    [setNodes, updateNode],
  );

  const addNode = useCallback(() => {
    setNodes((currentNodes) => [
      ...currentNodes,
      createTickerNode({
        x: 80 + currentNodes.length * 40,
        y: 80 + currentNodes.length * 40,
      }),
    ]);
  }, [setNodes]);

  const refreshAll = useCallback(() => {
    nodes.forEach((node) => {
      void refreshNode(node.id);
    });
  }, [nodes, refreshNode]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((currentEdges) => addEdge(connection, currentEdges)),
    [setEdges],
  );

  const renderedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        style: {
          width: 560,
          ...node.style,
        },
        data: {
          ...node.data,
          onDelete: deleteNode,
          onRefresh: refreshNode,
          onUpdate: updateNode,
        },
      })),
    [deleteNode, nodes, refreshNode, updateNode],
  );

  useEffect(() => {
    saveCanvas({
      nodes: stripCallbacks(nodes),
      edges,
      viewport,
    });
  }, [edges, nodes, viewport]);

  return (
    <main className="app-shell">
      <aside className="toolbar" aria-label="Canvas controls">
        <div>
          <h1>xscout</h1>
          <p>Arrange ticker lists on a canvas and refresh each list's performance table.</p>
        </div>
        <div className="toolbar__actions">
          <button type="button" onClick={addNode}>
            New List
          </button>
          <button type="button" onClick={refreshAll}>
            Refresh All
          </button>
        </div>
      </aside>

      <section className="canvas" aria-label="Ticker list canvas">
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
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </section>
    </main>
  );
}
