import { Panel, useReactFlow, useStore } from '@xyflow/react';
import { FitViewIcon } from './icons';

/**
 * An infinite canvas makes it easy to pan or zoom until every card is somewhere
 * off in the void, at which point the canvas is indistinguishable from an empty
 * one and there is nothing on screen to steer by. This offers the way back.
 */
export function OffscreenNotice() {
  const { fitView } = useReactFlow();

  // A boolean selector means panning only re-renders this panel on the frame the
  // last card actually leaves the viewport, not on every frame of the gesture.
  const hidden = useStore((state) => {
    if (state.nodeLookup.size === 0 || state.width === 0) {
      return 0;
    }
    const [offsetX, offsetY, zoom] = state.transform;
    let visible = 0;
    for (const node of state.nodeLookup.values()) {
      const { x, y } = node.internals.positionAbsolute;
      const width = node.measured.width ?? 0;
      const height = node.measured.height ?? 0;
      const left = x * zoom + offsetX;
      const top = y * zoom + offsetY;
      if (
        left < state.width &&
        left + width * zoom > 0 &&
        top < state.height &&
        top + height * zoom > 0
      ) {
        visible += 1;
      }
    }
    return visible === 0 ? state.nodeLookup.size : 0;
  });

  if (hidden === 0) {
    return null;
  }

  return (
    <Panel position="top-center" className="offscreen-notice">
      <span>
        {hidden === 1 ? 'Your list is' : `All ${hidden} lists are`} outside the view
      </span>
      <button type="button" className="button" onClick={() => fitView({ padding: 0.15, duration: 320 })}>
        <FitViewIcon />
        Bring them back
      </button>
    </Panel>
  );
}
