import { useEffect, useRef, useState } from "react";

import { CanvasControls } from "./canvas-controls";
import { CanvasItem } from "./canvas-item";
import { CanvasController } from "./controller";
import type { CanvasEntry } from "./registry";

export function Canvas({ entries }: { entries: readonly CanvasEntry[] }) {
  const [controller] = useState(() => new CanvasController(entries));
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const viewport = viewportRef.current;
    const world = worldRef.current;
    if (!host || !viewport || !world) return;
    return controller.attach(host, viewport, world);
  }, [controller]);

  useEffect(() => {
    controller.syncEntries(entries);
  }, [controller, entries]);

  return (
    <div ref={hostRef} className="fixed inset-0 overflow-clip bg-bg-page">
      <div
        ref={viewportRef}
        data-canvas-surface=""
        role="region"
        aria-label="Canvas"
        aria-describedby="canvas-instructions"
        className="absolute inset-0 cursor-default touch-none overflow-clip overscroll-none"
      >
        <div
          ref={worldRef}
          data-canvas-surface=""
          className="absolute top-0 left-0 size-0 origin-top-left"
        >
          {/* Under every item: a landing spot is always clear, so it only ever sits on empty canvas. */}
          <div
            aria-hidden
            data-canvas-slot=""
            style={{ zIndex: 0 }}
            className="pointer-events-none absolute top-0 left-0 bg-bg-hover opacity-0 ring-1 ring-border-strong ring-inset"
          />
          {entries.map((entry) => (
            <CanvasItem key={entry.id} entry={entry} controller={controller} />
          ))}
          {(["x", "y"] as const).map((axis) => (
            <div
              key={axis}
              aria-hidden
              data-canvas-guide={axis}
              style={{ zIndex: 1_500_000 }}
              className="pointer-events-none absolute top-0 left-0 bg-accent-solid opacity-0 transition-opacity duration-[var(--spring-fast,80ms)]"
            />
          ))}
        </div>
      </div>
      <CanvasControls controller={controller} />
      <p id="canvas-instructions" className="sr-only">
        Arrow keys pan. Plus and minus zoom. 1 fits everything. 0 resets the camera. Hold Space and
        drag to pan from anywhere.
      </p>
      <p id="canvas-move-instructions" className="sr-only">
        Arrow keys move this item. Hold Shift for larger steps.
      </p>
    </div>
  );
}
