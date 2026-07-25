import { useEffect, useRef } from 'react';
import { useReactFlow, useStoreApi } from '@xyflow/react';
import { MAX_ZOOM, MIN_ZOOM } from './constants';

/**
 * Keeps ctrl/cmd+wheel (and trackpad pinch) zooming the canvas even when the
 * pointer sits over an element that opts out of React Flow's wheel handling
 * with `nowheel` — otherwise a node whose table fills the screen would trap
 * the viewport. The listener has to be attached natively because React
 * registers `onWheel` passively, which forbids `preventDefault`.
 */
export function useModifierZoom<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const { getViewport, setViewport } = useReactFlow();
  const store = useStoreApi();

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      const pane = store.getState().domNode;
      if (!pane) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const { x, y, zoom } = getViewport();
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * Math.exp(-event.deltaY / 300)));
      if (nextZoom === zoom) {
        return;
      }

      // Anchor the zoom on the pointer so the content under the cursor stays put.
      const rect = pane.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      setViewport({
        x: pointerX - ((pointerX - x) / zoom) * nextZoom,
        y: pointerY - ((pointerY - y) / zoom) * nextZoom,
        zoom: nextZoom,
      });
    }

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [getViewport, setViewport, store]);

  return ref;
}
