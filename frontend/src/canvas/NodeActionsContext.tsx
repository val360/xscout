import { createContext, useContext, type ReactNode } from 'react';

// Node mutations live in a context rather than in each node's `data` so the
// `data` object keeps a stable identity between renders. That lets the
// memoised node component skip re-rendering while the canvas is panned,
// zoomed or dragged.
export type NodeActions = {
  refresh: (nodeId: string) => void;
  remove: (nodeId: string) => void;
  rename: (listId: string, name: string) => void;
  addTickers: (nodeId: string, listId: string, raw: string) => void;
  removeTicker: (nodeId: string, listId: string, ticker: string) => void;
};

const NodeActionsContext = createContext<NodeActions | undefined>(undefined);

export function NodeActionsProvider({
  actions,
  children,
}: {
  actions: NodeActions;
  children: ReactNode;
}) {
  return <NodeActionsContext.Provider value={actions}>{children}</NodeActionsContext.Provider>;
}

export function useNodeActions(): NodeActions {
  const context = useContext(NodeActionsContext);
  if (context === undefined) {
    throw new Error('useNodeActions must be used within a NodeActionsProvider.');
  }
  return context;
}
