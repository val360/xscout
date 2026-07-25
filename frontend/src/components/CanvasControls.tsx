import { Panel, useReactFlow, useStore } from '@xyflow/react';
import { usePreferences } from '../prefs/PreferencesContext';
import { MAX_ZOOM, MIN_ZOOM, VIEWPORT_TWEEN_MS } from '../canvas/constants';
import { FitViewIcon, MapIcon, MinusIcon, PlusIcon } from './icons';

export function CanvasControls({ canFitView }: { canFitView: boolean }) {
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();
  const zoom = useStore((state) => state.transform[2]);
  const { showMinimap, setShowMinimap } = usePreferences();

  const tween = { duration: VIEWPORT_TWEEN_MS };

  return (
    <Panel position="bottom-left" className="canvas-controls">
      <div className="canvas-controls__group">
        <button
          type="button"
          className="icon-button"
          onClick={() => zoomOut(tween)}
          disabled={zoom <= MIN_ZOOM + 0.001}
          aria-label="Zoom out"
          title="Zoom out  ( − )"
        >
          <MinusIcon />
        </button>
        <button
          type="button"
          className="canvas-controls__zoom"
          onClick={() => zoomTo(1, tween)}
          aria-label="Reset zoom to 100%"
          title="Reset zoom to 100%"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => zoomIn(tween)}
          disabled={zoom >= MAX_ZOOM - 0.001}
          aria-label="Zoom in"
          title="Zoom in  ( + )"
        >
          <PlusIcon />
        </button>
      </div>

      <div className="canvas-controls__group">
        <button
          type="button"
          className="icon-button"
          onClick={() => fitView({ padding: 0.15, duration: 320 })}
          disabled={!canFitView}
          aria-label="Fit all lists in view"
          title="Fit all lists in view  ( F )"
        >
          <FitViewIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => setShowMinimap(!showMinimap)}
          aria-pressed={showMinimap}
          aria-label={showMinimap ? 'Hide minimap' : 'Show minimap'}
          title={showMinimap ? 'Hide minimap' : 'Show minimap'}
        >
          <MapIcon />
        </button>
      </div>
    </Panel>
  );
}
