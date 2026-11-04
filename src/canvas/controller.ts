import { animate } from "motion";

import { applyMotionTuning, getMotionTuning, spring } from "@/lib/springs";

import {
  type Camera,
  clampCamera,
  clampCoordinate,
  findOpenSpot,
  nearestFreeSpot,
  fitCamera,
  type Point,
  type Rect,
  resetCamera,
  revealCamera,
  landingFor,
  magnetize,
  type SnapGuide,
  type SnapNeighbor,
  type Size,
  unionRects,
  zoomAround,
} from "./geometry";
import {
  type Preferences,
  readLayout,
  type SavedLayout,
  serializeLayout,
  writeLayout,
} from "./layout-storage";
import { ItemMotion } from "./item-motion";
import type { CanvasEntry } from "./registry";

const FIT_PADDING = 72;
const REVEAL_PADDING = 48;
const PLACEMENT_GAP = 48;
const ITEM_GAP = 24;
const SNAP_DISTANCE = 8;
const LIFT_SCALE = 0.015;
/** Neighbors farther away than this, across the line, aren't worth aligning to. */
const SNAP_REACH = 280;
const AUTO_PAN_EDGE = 28;
const AUTO_PAN_SPEED = 520;
/** A pointer has to rest at an edge before the canvas moves, so passing near one does nothing. */
const AUTO_PAN_DWELL_MS = 350;
const CARRIED_FRAME_LAYER = 2_000_000;
const CARRIED_LABEL_LAYER = 2_000_001;
const RESTING_LABEL_LAYER = 1_000_000;
const WHEEL_ZOOM_SPEED = 0.01;
const MAX_WHEEL_ZOOM_DELTA = 30;
const WHEEL_LATCH_MS = 140;
const SAVE_DELAY_MS = 300;
const BUTTON_ZOOM_FACTOR = 1.25;
const OVERLAY_SELECTOR = "[data-canvas-overlay]";
/** Holds focus for a panel without being a control, so canvas shortcuts still apply. */
const FOCUS_LANDING_ATTRIBUTE = "data-focus-landing";
const SURFACE_ATTRIBUTE = "data-canvas-surface";
const HANDLE_ATTRIBUTE = "data-canvas-handle";

const INTERACTIVE_SELECTOR =
  "a[href],button,input,select,textarea,summary,audio[controls],video[controls],[contenteditable]:not([contenteditable='false']),[tabindex],[role='button'],[role='link'],[role='menuitem'],[role='option'],[role='slider'],[role='switch'],[role='tab'],[role='textbox']";

type Gesture =
  | { kind: "pan"; pointerId: number; last: Point; explicit: boolean }
  | {
      kind: "move";
      pointerId: number;
      id: string;
      /** The pointer in client coordinates, and how far it first was from the frame's corner. */
      pointer: Point;
      pressedAt: Point;
      grab: Point;
      /** Measured once at pickup, since nothing else moves during a drag. */
      frame: Rect;
      bounds: Rect;
      neighbors: SnapNeighbor[];
      home: Point;
      landing: Point;
      snap: boolean;
      /** Stays false until the pointer really moves, so a press at the edge doesn't scroll. */
      travelled: boolean;
      atEdgeSince: number | null;
    }
  | { kind: "pinch"; distance: number; center: Point };

type ItemNodes = { frame: HTMLElement | null; chrome: HTMLElement | null };
type WheelOwner = "canvas" | "native";

function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function middleOf(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function normalizedWheelDelta(event: WheelEvent): Point {
  const unit =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? 400
        : 1;
  return { x: event.deltaX * unit, y: event.deltaY * unit };
}

function canScrollInDirection(element: Element, delta: Point): boolean {
  const style = getComputedStyle(element);
  const scrollsX = /auto|scroll|overlay/.test(style.overflowX);
  const scrollsY = /auto|scroll|overlay/.test(style.overflowY);
  if (scrollsY && delta.y !== 0) {
    const maxTop = element.scrollHeight - element.clientHeight;
    if (delta.y > 0 ? element.scrollTop < maxTop - 1 : element.scrollTop > 1) return true;
  }
  if (scrollsX && delta.x !== 0) {
    const maxLeft = element.scrollWidth - element.clientWidth;
    // scrollLeft runs negative in RTL, so compare its distance from the start.
    const left = Math.abs(element.scrollLeft);
    if (delta.x > 0 ? left < maxLeft - 1 : left > 1) return true;
  }
  return false;
}

/**
 * Owns everything that moves on the canvas. Camera and positions live here rather than in React
 * state, so panning, zooming, and dragging never rerender a preview.
 */
export class CanvasController {
  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private hasCamera = false;
  private preferences: Preferences;
  private readonly positions = new Map<string, Point>();
  private readonly nodes = new Map<string, ItemNodes>();
  private entries: readonly CanvasEntry[];
  /** Items the saved layout hasn't seen yet. They get placed in open space and revealed. */
  private pendingPlacement = new Set<string>();

  private host: HTMLElement | null = null;
  private viewport: HTMLElement | null = null;
  private world: HTMLElement | null = null;
  private zoomOutput: HTMLElement | null = null;
  private viewportSize: Size = { width: 0, height: 0 };
  private viewportOrigin: Point = { x: 0, y: 0 };

  private readonly bounds = new Map<string, Rect>();
  private boundsDirty = true;
  private resizeObserver: ResizeObserver | null = null;

  private gesture: Gesture | null = null;
  private readonly touches = new Map<number, Point>();
  private spaceHeld = false;
  private wheelOwner: WheelOwner | null = null;
  private wheelTimer: number | undefined;
  private safariGestureZoom: number | null = null;
  private clickGuardTimer: number | undefined;
  private clickGuardActive = false;
  private frameRequest: number | null = null;
  private cameraDirty = false;
  private readonly dirtyItems = new Set<string>();
  private readonly itemMotion = new ItemMotion(
    (id) => {
      const nodes = this.nodes.get(id);
      if (nodes) this.writeItem(id, nodes);
    },
    (dt) => this.updateDrag(dt),
    () => this.prefersReducedMotion(),
  );
  private saveTimer: number | undefined;
  private flight: { stop: () => void; target: Camera } | null = null;
  private nextPreviewLayer = 1;
  private teardown: (() => void) | null = null;

  constructor(entries: readonly CanvasEntry[]) {
    this.entries = entries;
    const saved = readLayout(new Set(entries.map((entry) => entry.id)));
    this.preferences = saved.preferences;
    this.applyPreferences();
    this.loadPositions(saved);
    if (saved.camera) {
      this.camera = saved.camera;
      this.hasCamera = true;
    }
  }

  // --- React bindings ---------------------------------------------------------------------------

  attachFrame = (id: string, element: HTMLElement): (() => void) =>
    this.attachNode(id, "frame", element);

  attachChrome = (id: string, element: HTMLElement): (() => void) =>
    this.attachNode(id, "chrome", element);

  attachZoomOutput = (element: HTMLElement | null): void => {
    this.zoomOutput = element;
    this.writeZoomOutput();
  };

  attach(host: HTMLElement, viewport: HTMLElement, world: HTMLElement): () => void {
    this.teardown?.();
    this.host = host;
    this.viewport = viewport;
    this.world = world;
    this.measureViewport();
    this.writeAll();

    const controller = new AbortController();
    const { signal } = controller;

    // Wheel sits on the host so pinch over the fixed controls can't zoom the browser page instead.
    host.addEventListener("wheel", this.onWheel, { passive: false, signal });
    // Capture so explicit pans take priority over whatever the preview under the pointer wants.
    viewport.addEventListener("pointerdown", this.onPointerDown, { capture: true, signal });
    viewport.addEventListener("pointermove", this.onPointerMove, { capture: true, signal });
    viewport.addEventListener("pointerup", this.onPointerEnd, { capture: true, signal });
    viewport.addEventListener("pointercancel", this.onPointerEnd, { capture: true, signal });
    viewport.addEventListener("lostpointercapture", this.onLostCapture, { signal });
    viewport.addEventListener("mousedown", this.onMouseDown, { capture: true, signal });
    viewport.addEventListener("focusin", this.onFocusIn, { signal });
    host.addEventListener("gesturestart", this.onSafariGestureStart, { signal });
    host.addEventListener("gesturechange", this.onSafariGestureChange, { signal });
    host.addEventListener("gestureend", this.onSafariGestureEnd, { signal });
    window.addEventListener("keydown", this.onWindowKeyDown, { signal });
    window.addEventListener("keydown", this.onShortcutKeyDown, { signal });
    window.addEventListener("keyup", this.onWindowKeyUp, { signal });
    window.addEventListener("blur", this.cancelInput, { signal });
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", this.applyPreferences, { signal });
    window.addEventListener("pagehide", this.flushSave, { signal });
    document.addEventListener("visibilitychange", this.onVisibilityChange, { signal });
    // Bubble phase on document: a preview's own handler runs first and can claim the event.
    document.addEventListener("click", this.onDocumentClick, { signal });
    document.addEventListener("submit", this.onDocumentSubmit, { signal });

    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(viewport);
    for (const nodes of this.nodes.values()) this.observeNodes(nodes);

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverscroll = html.style.overscrollBehaviorX;
    const previousBodyOverscroll = body.style.overscrollBehaviorX;
    html.style.overscrollBehaviorX = "none";
    body.style.overscrollBehaviorX = "none";

    let cancelled = false;
    let settleFrame: number | null = null;
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      settleFrame = requestAnimationFrame(() => {
        settleFrame = null;
        this.boundsDirty = true;
        if (!this.hasCamera) {
          this.setCamera(this.fittedCamera() ?? resetCamera(this.viewportSize));
          this.hasCamera = true;
        }
      });
    });

    const detach = () => {
      cancelled = true;
      if (settleFrame !== null) cancelAnimationFrame(settleFrame);
      controller.abort();
      this.stopFlight();
      this.cancelInput();
      this.itemMotion.stopAll();
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      if (this.frameRequest !== null) cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
      this.flushFrame();
      window.clearTimeout(this.wheelTimer);
      window.clearTimeout(this.clickGuardTimer);
      this.removeClickGuard();
      this.flushSave();
      html.style.overscrollBehaviorX = previousHtmlOverscroll;
      body.style.overscrollBehaviorX = previousBodyOverscroll;
      this.host = null;
      this.viewport = null;
      this.world = null;
      this.teardown = null;
    };
    this.teardown = detach;
    return detach;
  }

  /** Reconciles with the registry after a source edit, without touching existing items. */
  syncEntries(entries: readonly CanvasEntry[]): void {
    this.entries = entries;
    const ids = new Set(entries.map((entry) => entry.id));
    for (const id of this.positions.keys()) {
      if (!ids.has(id)) this.positions.delete(id);
    }
    for (const entry of entries) {
      if (!this.positions.has(entry.id)) {
        this.positions.set(entry.id, { x: entry.x, y: entry.y });
        this.pendingPlacement.add(entry.id);
      }
    }
    this.boundsDirty = true;
    this.placePendingItems();
    this.separateOverlappingItems();
  }

  // --- Public actions ---------------------------------------------------------------------------

  get currentPreferences(): Preferences {
    return this.preferences;
  }

  setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
    this.preferences = { ...this.preferences, [key]: value };
    this.applyPreferences();
    this.scheduleSave();
  }

  zoomIn = (): void => this.zoomByFactor(BUTTON_ZOOM_FACTOR);
  zoomOut = (): void => this.zoomByFactor(1 / BUTTON_ZOOM_FACTOR);

  fitAll = (): void => {
    const target = this.fittedCamera();
    if (target) this.flyTo(target);
  };

  resetView = (): void => this.flyTo(resetCamera(this.viewportSize));

  /** Brings one item to the middle, at full size if it fits. */
  focusItem(id: string): void {
    const rect = this.itemBounds().get(id);
    if (rect) this.flyTo(fitCamera(rect, this.viewportSize, FIT_PADDING));
  }

  /** The move handle's keyboard path. Steps are canvas units, so they don't change with zoom. */
  nudgeItem(id: string, dx: number, dy: number): void {
    const position = this.positions.get(id);
    if (!position) return;
    const others = this.itemBounds();
    const bounds = others.get(id);
    if (!bounds) return;
    const obstacles = [...others].filter(([other]) => other !== id).map(([, rect]) => rect);
    // Keyboard moves keep going the same way until clear, so an arrow key can hop past a neighbor.
    let steps = 1;
    const clearAt = (count: number) => {
      const rect = { ...bounds, x: bounds.x + dx * count, y: bounds.y + dy * count };
      const spot = nearestFreeSpot(rect, obstacles, ITEM_GAP);
      return spot.x === rect.x && spot.y === rect.y;
    };
    while (!clearAt(steps) && steps < 10_000) steps += 1;
    const target = { x: position.x + dx * steps, y: position.y + dy * steps };
    this.itemMotion.glide(id, this.itemMotion.pose(id) ?? position, target);
    this.moveItem(id, target.x, target.y);
    this.revealItem(id, false);
    this.scheduleSave();
  }

  // --- Items ------------------------------------------------------------------------------------

  private attachNode(id: string, slot: keyof ItemNodes, element: HTMLElement): () => void {
    const nodes = this.nodes.get(id) ?? { frame: null, chrome: null };
    nodes[slot] = element;
    this.nodes.set(id, nodes);
    if (slot === "frame") element.style.zIndex = String(this.nextPreviewLayer++);
    this.writeItem(id, nodes);
    this.resizeObserver?.observe(element);
    this.boundsDirty = true;
    return () => {
      this.resizeObserver?.unobserve(element);
      if (nodes[slot] === element) nodes[slot] = null;
      if (!nodes.frame && !nodes.chrome) this.nodes.delete(id);
      this.boundsDirty = true;
    };
  }

  private observeNodes(nodes: ItemNodes): void {
    if (nodes.frame) this.resizeObserver?.observe(nodes.frame);
    if (nodes.chrome) this.resizeObserver?.observe(nodes.chrome);
  }

  private loadPositions(saved: SavedLayout): void {
    const hasSavedLayout = saved.positions.size > 0 || saved.camera !== null;
    for (const entry of this.entries) {
      const position = saved.positions.get(entry.id);
      this.positions.set(entry.id, position ?? { x: entry.x, y: entry.y });
      if (!position && hasSavedLayout) this.pendingPlacement.add(entry.id);
    }
  }

  private moveItem(id: string, x: number, y: number): void {
    this.positions.set(id, { x: clampCoordinate(x), y: clampCoordinate(y) });
    this.dirtyItems.add(id);
    this.bounds.delete(id);
    this.boundsDirty = true;
    this.requestFrame();
  }

  private writeItem(id: string, nodes: ItemNodes): void {
    const pose = this.itemMotion.pose(id);
    const position = pose ?? this.positions.get(id);
    if (!position) return;
    const place = `translate(${position.x}px, ${position.y}px)`;
    const body = pose ? ` scale(${1 + LIFT_SCALE * pose.lift})` : "";
    if (nodes.frame) nodes.frame.style.transform = `${place}${body}`;
    // The label row sits directly above the frame, whatever height it measures.
    if (nodes.chrome) nodes.chrome.style.transform = `${place} translateY(-100%)${body}`;
  }

  private itemBounds(): Map<string, Rect> {
    if (!this.boundsDirty) return this.bounds;
    this.bounds.clear();
    // Layout sizes ignore the transforms, so this holds at any zoom. Reads happen together here.
    for (const [id, nodes] of this.nodes) {
      const position = this.positions.get(id);
      if (!position || !nodes.frame) continue;
      const rects: Rect[] = [
        {
          x: position.x,
          y: position.y,
          width: nodes.frame.offsetWidth,
          height: nodes.frame.offsetHeight,
        },
      ];
      if (nodes.chrome) {
        const height = nodes.chrome.offsetHeight;
        rects.push({
          x: position.x,
          y: position.y - height,
          width: nodes.chrome.offsetWidth,
          height,
        });
      }
      const union = unionRects(rects);
      if (union) this.bounds.set(id, union);
    }
    this.boundsDirty = false;
    return this.bounds;
  }

  /** Saved layouts and resized entries can arrive overlapping. Registry order decides who moves. */
  private separateOverlappingItems(): void {
    const bounds = new Map(this.itemBounds());
    const placed: Rect[] = [];
    let moved = false;
    for (const entry of this.entries) {
      const rect = bounds.get(entry.id);
      const position = this.positions.get(entry.id);
      if (!rect || !position) continue;
      const spot = nearestFreeSpot(rect, placed, ITEM_GAP);
      if (spot.x !== rect.x || spot.y !== rect.y) {
        this.moveItem(entry.id, position.x + spot.x - rect.x, position.y + spot.y - rect.y);
        moved = true;
      }
      placed.push({ ...rect, ...spot });
    }
    if (moved) this.scheduleSave();
  }

  private placePendingItems(): void {
    if (this.pendingPlacement.size === 0 || !this.viewport) return;
    const bounds = this.itemBounds();
    const ready = [...this.pendingPlacement].filter((id) => bounds.has(id));
    if (ready.length === 0) return;

    const occupied = [...bounds]
      .filter(([id]) => !this.pendingPlacement.has(id))
      .map(([, rect]) => rect);
    const placed: Rect[] = [];
    for (const id of ready) {
      const rect = bounds.get(id);
      const position = this.positions.get(id);
      if (!rect || !position) continue;
      const spot = findOpenSpot(rect, occupied, PLACEMENT_GAP);
      const moved = {
        ...rect,
        x: spot.x,
        y: spot.y,
      };
      this.moveItem(id, position.x + (spot.x - rect.x), position.y + (spot.y - rect.y));
      this.pendingPlacement.delete(id);
      occupied.push(moved);
      placed.push(moved);
    }
    const union = unionRects(placed);
    if (union && this.hasCamera) {
      this.flyTo(revealCamera(this.camera, union, this.viewportSize, REVEAL_PADDING));
    }
    this.scheduleSave();
  }

  private revealItem(id: string, animated: boolean): void {
    const rect = this.itemBounds().get(id);
    if (!rect) return;
    const target = revealCamera(this.camera, rect, this.viewportSize, REVEAL_PADDING);
    if (animated) this.flyTo(target);
    else this.setCamera(target);
  }

  // --- Camera -----------------------------------------------------------------------------------

  private setCamera(next: Camera): void {
    this.camera = clampCamera(next);
    this.hasCamera = true;
    this.cameraDirty = true;
    this.requestFrame();
    this.scheduleSave();
  }

  private panBy(dx: number, dy: number): void {
    this.setCamera({ ...this.camera, x: this.camera.x + dx, y: this.camera.y + dy });
  }

  private fittedCamera(): Camera | null {
    const bounds = unionRects([...this.itemBounds().values()]);
    return bounds ? fitCamera(bounds, this.viewportSize, FIT_PADDING) : null;
  }

  private zoomByFactor(factor: number): void {
    const center = { x: this.viewportSize.width / 2, y: this.viewportSize.height / 2 };
    const from = this.flight?.target ?? this.camera;
    this.flyTo(zoomAround(from, center, from.zoom * factor));
  }

  /** Interpolates the viewport-center world point and log zoom, so button zooms stay centered. */
  private flyTo(target: Camera): void {
    this.stopFlight();
    if (this.prefersReducedMotion()) {
      this.setCamera(target);
      return;
    }
    const start = this.camera;
    const halfWidth = this.viewportSize.width / 2;
    const halfHeight = this.viewportSize.height / 2;
    const startCenter = {
      x: (halfWidth - start.x) / start.zoom,
      y: (halfHeight - start.y) / start.zoom,
    };
    const endCenter = {
      x: (halfWidth - target.x) / target.zoom,
      y: (halfHeight - target.y) / target.zoom,
    };
    const animation = animate(0, 1, {
      type: spring.moderate.type,
      duration: spring.moderate.duration,
      bounce: spring.moderate.bounce,
      onUpdate: (t) => {
        const zoom = start.zoom * (target.zoom / start.zoom) ** t;
        const centerX = startCenter.x + (endCenter.x - startCenter.x) * t;
        const centerY = startCenter.y + (endCenter.y - startCenter.y) * t;
        this.setCamera({ x: halfWidth - centerX * zoom, y: halfHeight - centerY * zoom, zoom });
      },
      onComplete: () => {
        this.flight = null;
        this.setCamera(target);
      },
    });
    this.flight = { stop: () => animation.stop(), target };
  }

  private stopFlight(): void {
    this.flight?.stop();
    this.flight = null;
  }

  private measureViewport(): void {
    if (!this.viewport) return;
    const rect = this.viewport.getBoundingClientRect();
    this.viewportSize = { width: rect.width, height: rect.height };
    this.viewportOrigin = { x: rect.left, y: rect.top };
  }

  private toViewportPoint(clientX: number, clientY: number): Point {
    return { x: clientX - this.viewportOrigin.x, y: clientY - this.viewportOrigin.y };
  }

  // --- Frame writes -----------------------------------------------------------------------------

  private requestFrame(): void {
    if (this.frameRequest !== null) return;
    this.frameRequest = requestAnimationFrame(() => {
      this.frameRequest = null;
      this.flushFrame();
    });
  }

  private flushFrame(): void {
    if (this.cameraDirty && this.world) {
      this.writeCamera();
      this.cameraDirty = false;
    }
    for (const id of this.dirtyItems) {
      const nodes = this.nodes.get(id);
      if (nodes) this.writeItem(id, nodes);
    }
    this.dirtyItems.clear();
  }

  private writeAll(): void {
    this.writeCamera();
    for (const [id, nodes] of this.nodes) this.writeItem(id, nodes);
  }

  private writeCamera(): void {
    if (!this.world) return;
    const { x, y, zoom } = this.camera;
    this.world.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    this.writeZoomOutput();
  }

  private writeZoomOutput(): void {
    if (!this.zoomOutput) return;
    const text = `${Math.round(this.camera.zoom * 100)}%`;
    if (this.zoomOutput.textContent !== text) this.zoomOutput.textContent = text;
  }

  // --- Pointer gestures -------------------------------------------------------------------------

  private onPointerDown = (event: PointerEvent): void => {
    const viewport = this.viewport;
    if (!viewport || !(event.target instanceof Element)) return;
    this.stopFlight();
    this.removeClickGuard();

    const point = { x: event.clientX, y: event.clientY };
    if (event.pointerType === "touch") {
      this.touches.set(event.pointerId, point);
      if (this.touches.size === 2) {
        this.beginPinch();
        return;
      }
      if (this.touches.size > 2) return;
    }
    if (this.gesture) return;

    // Space+primary or middle pans from anywhere, over previews included.
    const explicitPan =
      event.button === 1 || (event.button === 0 && this.spaceHeld && event.pointerType !== "touch");
    if (explicitPan) {
      this.beginGesture(event, {
        kind: "pan",
        pointerId: event.pointerId,
        last: point,
        explicit: true,
      });
      event.stopPropagation();
      return;
    }
    if (event.button !== 0) return;

    const handle = event.target.closest<HTMLElement>(`[${HANDLE_ATTRIBUTE}]`);
    const id = handle?.getAttribute(HANDLE_ATTRIBUTE);
    if (handle && id) {
      this.pickUpItem(event, id);
      // A mouse drag isn't keyboard use, so nothing should wear a focus ring because of it.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      return;
    }

    if (event.target.hasAttribute(SURFACE_ATTRIBUTE)) {
      this.beginGesture(event, {
        kind: "pan",
        pointerId: event.pointerId,
        last: point,
        explicit: false,
      });
      // Empty canvas takes focus off whatever had it, which hands the keyboard shortcuts back.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
  };

  /** The single place a gesture changes, so its cursor and pick-up state can't fall out of step. */
  private setGesture(next: Gesture | null): void {
    const previous = this.gesture;
    this.gesture = next;
    if (previous?.kind === "move") this.dropItem(previous, previous.landing);
    if (next?.kind === "move") this.markMoving(next.id, true);
    this.syncCursor();
  }

  private pickUpItem(event: PointerEvent, id: string): void {
    const position = this.positions.get(id);
    const others = this.itemBounds();
    const bounds = others.get(id);
    const frame = this.frameRect(id);
    const nodes = this.nodes.get(id);
    if (!position || !bounds || !frame || !nodes?.frame || !nodes.chrome) return;

    const neighbors: SnapNeighbor[] = [];
    for (const [other, otherBounds] of others) {
      const otherFrame = other === id ? null : this.frameRect(other);
      if (otherFrame) neighbors.push({ frame: otherFrame, bounds: otherBounds });
    }

    // Pivot on the frame's center, so the frame and its label lift and lean as one object.
    const labelHeight = nodes.chrome.offsetHeight;
    nodes.frame.style.transformOrigin = "center";
    nodes.chrome.style.transformOrigin = `${frame.width / 2}px ${labelHeight + frame.height / 2}px`;
    // Its own layer for the trip, so the card isn't repainted on every frame.
    nodes.frame.style.willChange = "transform";
    nodes.chrome.style.willChange = "transform";
    nodes.frame.style.zIndex = String(CARRIED_FRAME_LAYER);
    nodes.chrome.style.zIndex = String(CARRIED_LABEL_LAYER);

    this.itemMotion.pickUp(id, position);
    // Grabbed mid-landing, the item continues from where it visibly is.
    const pose = this.itemMotion.pose(id) ?? position;
    const pointer = { x: event.clientX, y: event.clientY };
    const world = this.toWorldPoint(pointer);
    this.beginGesture(event, {
      kind: "move",
      pointerId: event.pointerId,
      id,
      pointer,
      pressedAt: pointer,
      grab: { x: world.x - pose.x, y: world.y - pose.y },
      frame,
      bounds,
      neighbors,
      home: position,
      landing: position,
      snap: !event.ctrlKey && !event.metaKey,
      travelled: false,
      atEdgeSince: null,
    });
    this.showSlot(frame, position, false, nodes.frame);
  }

  /** Runs once per frame while carrying, so camera moves and pointer moves count the same. */
  private updateDrag(dt: number): void {
    const gesture = this.gesture;
    if (gesture?.kind !== "move") return;
    if (gesture.travelled) this.autoPan(gesture, dt);

    const world = this.toWorldPoint(gesture.pointer);
    const desired = { x: world.x - gesture.grab.x, y: world.y - gesture.grab.y };
    const threshold = SNAP_DISTANCE / this.camera.zoom;
    const landing = landingFor({
      reach: SNAP_REACH,
      desired,
      frame: gesture.frame,
      bounds: gesture.bounds,
      neighbors: gesture.neighbors,
      gap: ITEM_GAP,
      threshold,
      snap: gesture.snap,
    });
    gesture.landing = { x: landing.x, y: landing.y };

    const pulled = gesture.snap ? magnetize(desired, landing, threshold) : desired;
    this.itemMotion.carryTo(desired, { x: pulled.x - desired.x, y: pulled.y - desired.y });
    const away = distanceBetween(desired, landing) * this.camera.zoom > SNAP_DISTANCE;
    this.showSlot(gesture.frame, landing, away);
    this.showGuides(landing.guides);
  }

  private autoPan(gesture: Extract<Gesture, { kind: "move" }>, dt: number): void {
    const { x, y } = this.toViewportPoint(gesture.pointer.x, gesture.pointer.y);
    const { width, height } = this.viewportSize;
    // Eases in with depth, so it starts as a nudge rather than a lurch.
    const push = (distanceIn: number) =>
      Math.max(0, (AUTO_PAN_EDGE - distanceIn) / AUTO_PAN_EDGE) ** 2;
    const dx = push(x) - push(width - x);
    const dy = push(y) - push(height - y);
    if (dx === 0 && dy === 0) {
      gesture.atEdgeSince = null;
      return;
    }
    const now = performance.now();
    gesture.atEdgeSince ??= now;
    if (now - gesture.atEdgeSince < AUTO_PAN_DWELL_MS) return;
    this.panBy(dx * AUTO_PAN_SPEED * dt, dy * AUTO_PAN_SPEED * dt);
  }

  private dropItem(gesture: Extract<Gesture, { kind: "move" }>, target: Point): void {
    const { id } = gesture;
    this.markMoving(id, false);
    this.showGuides([]);
    this.hideSlot();
    this.positions.set(id, target);
    this.bounds.delete(id);
    this.boundsDirty = true;
    this.followOffscreenLanding(gesture, target);
    this.itemMotion.drop(target, () => {
      const nodes = this.nodes.get(id);
      if (nodes?.frame) {
        nodes.frame.style.zIndex = String(this.nextPreviewLayer++);
        nodes.frame.style.transformOrigin = "";
        nodes.frame.style.willChange = "";
      }
      if (nodes?.chrome) {
        nodes.chrome.style.zIndex = String(RESTING_LABEL_LAYER);
        nodes.chrome.style.transformOrigin = "";
        nodes.chrome.style.willChange = "";
      }
      this.scheduleSave();
    });
  }

  /** A landing spot can sit past the viewport's edge, and the item shouldn't vanish into it. */
  private followOffscreenLanding(gesture: Extract<Gesture, { kind: "move" }>, target: Point): void {
    const { bounds, frame } = gesture;
    const rect = { ...bounds, x: bounds.x + target.x - frame.x, y: bounds.y + target.y - frame.y };
    const { x, y, zoom } = this.camera;
    const left = x + rect.x * zoom;
    const top = y + rect.y * zoom;
    const inView =
      left >= 0 &&
      top >= 0 &&
      left + rect.width * zoom <= this.viewportSize.width &&
      top + rect.height * zoom <= this.viewportSize.height;
    if (!inView) this.flyTo(revealCamera(this.camera, rect, this.viewportSize, REVEAL_PADDING));
  }

  private frameRect(id: string): Rect | null {
    const frame = this.nodes.get(id)?.frame;
    const position = this.positions.get(id);
    if (!frame || !position) return null;
    return { x: position.x, y: position.y, width: frame.offsetWidth, height: frame.offsetHeight };
  }

  private slotNode(): HTMLElement | null {
    return this.world?.querySelector<HTMLElement>("[data-canvas-slot]") ?? null;
  }

  /** Shown only when the drop would land somewhere other than under the pointer. */
  private showSlot(frame: Rect, landing: Point, visible: boolean, shapeFrom?: HTMLElement): void {
    const slot = this.slotNode();
    if (!slot) return;
    if (shapeFrom) {
      slot.style.width = `${frame.width}px`;
      slot.style.height = `${frame.height}px`;
      slot.style.borderRadius = getComputedStyle(shapeFrom).borderRadius;
    }
    // Eases only between two landing spots. Appearing, it's already in the right place.
    const wasVisible = slot.style.opacity === "1";
    slot.style.transition = visible && wasVisible ? "" : "opacity var(--spring-fast, 80ms) linear";
    slot.style.transform = `translate(${landing.x}px, ${landing.y}px)`;
    slot.style.opacity = visible ? "1" : "0";
  }

  private hideSlot(): void {
    const slot = this.slotNode();
    if (slot) slot.style.opacity = "0";
  }

  private showGuides(guides: SnapGuide[]): void {
    const { world } = this;
    if (!world) return;
    const thickness = 1 / this.camera.zoom;
    for (const axis of ["x", "y"] as const) {
      const line = world.querySelector<HTMLElement>(`[data-canvas-guide="${axis}"]`);
      if (!line) continue;
      const guide = guides.find((candidate) => candidate.axis === axis);
      if (!guide) {
        line.style.opacity = "0";
        continue;
      }
      const length = guide.end - guide.start;
      line.style.opacity = "1";
      line.style.width = `${axis === "x" ? thickness : length}px`;
      line.style.height = `${axis === "x" ? length : thickness}px`;
      line.style.transform =
        axis === "x"
          ? `translate(${guide.at - thickness / 2}px, ${guide.start}px)`
          : `translate(${guide.start}px, ${guide.at - thickness / 2}px)`;
    }
  }

  private toWorldPoint(client: Point): Point {
    const { x, y } = this.toViewportPoint(client.x, client.y);
    return { x: (x - this.camera.x) / this.camera.zoom, y: (y - this.camera.y) / this.camera.zoom };
  }

  private prefersReducedMotion(): boolean {
    const { reducedMotion } = getMotionTuning();
    return (
      reducedMotion === "always" ||
      (reducedMotion === "user" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    );
  }

  private markMoving(id: string, moving: boolean): void {
    const nodes = this.nodes.get(id);
    for (const node of [nodes?.frame, nodes?.chrome]) {
      if (moving) node?.setAttribute("data-moving", "");
      else node?.removeAttribute("data-moving");
    }
  }

  private syncCursor(): void {
    if (!this.viewport) return;
    const dragging = this.gesture && this.gesture.kind !== "pinch";
    // Pointer capture makes the viewport own the cursor for the whole drag.
    this.viewport.style.cursor = dragging ? "grabbing" : this.spaceHeld ? "grab" : "";
  }

  private beginGesture(event: PointerEvent, gesture: Gesture): void {
    this.setGesture(gesture);
    // Cancels the compatibility mouse events, so no text selection or autoscroll starts underneath.
    event.preventDefault();
    this.capturePointer(event.pointerId);
  }

  private capturePointer(pointerId: number): void {
    try {
      this.viewport?.setPointerCapture(pointerId);
    } catch {
      // The pointer can already be gone by the time capture is requested.
    }
  }

  private releasePointer(pointerId: number): void {
    try {
      if (this.viewport?.hasPointerCapture(pointerId)) {
        this.viewport.releasePointerCapture(pointerId);
      }
    } catch {
      // Same race as above, on the way out.
    }
  }

  private beginPinch(): void {
    const [a, b] = [...this.touches.values()];
    if (!a || !b) return;
    if (this.gesture && this.gesture.kind !== "pinch") {
      this.releasePointer(this.gesture.pointerId);
    }
    for (const pointerId of this.touches.keys()) this.capturePointer(pointerId);
    this.setGesture({ kind: "pinch", distance: distanceBetween(a, b), center: middleOf(a, b) });
    this.scheduleSave();
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === "touch" && this.touches.has(event.pointerId)) {
      this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    const gesture = this.gesture;
    if (!gesture) return;

    if (gesture.kind === "pinch") {
      const [a, b] = [...this.touches.values()];
      if (!a || !b) return;
      const distance = distanceBetween(a, b);
      const center = middleOf(a, b);
      if (gesture.distance > 0 && distance > 0) {
        const anchor = this.toViewportPoint(center.x, center.y);
        const zoomed = zoomAround(
          this.camera,
          anchor,
          this.camera.zoom * (distance / gesture.distance),
        );
        this.setCamera({
          ...zoomed,
          x: zoomed.x + center.x - gesture.center.x,
          y: zoomed.y + center.y - gesture.center.y,
        });
      }
      gesture.distance = distance;
      gesture.center = center;
      return;
    }

    if (event.pointerId !== gesture.pointerId) return;

    if (gesture.kind === "move") {
      gesture.pointer = { x: event.clientX, y: event.clientY };
      gesture.snap = !event.ctrlKey && !event.metaKey;
      gesture.travelled ||= distanceBetween(gesture.pointer, gesture.pressedAt) > SNAP_DISTANCE;
      return;
    }

    const dx = event.clientX - gesture.last.x;
    const dy = event.clientY - gesture.last.y;
    gesture.last = { x: event.clientX, y: event.clientY };
    this.panBy(dx, dy);
  };

  private onPointerEnd = (event: PointerEvent): void => {
    const wasTracked = this.touches.delete(event.pointerId);
    const gesture = this.gesture;
    if (!gesture) return;

    if (gesture.kind === "pinch") {
      if (!wasTracked || this.touches.size >= 2) {
        if (this.touches.size >= 2) this.beginPinch();
        return;
      }
      this.armClickGuard();
      this.releasePointer(event.pointerId);
      const [remaining] = [...this.touches.entries()];
      // Carry on as a pan from the finger still down, so the canvas doesn't jump.
      this.setGesture(
        remaining
          ? { kind: "pan", pointerId: remaining[0], last: remaining[1], explicit: true }
          : null,
      );
      this.scheduleSave();
      return;
    }

    if (event.pointerId !== gesture.pointerId) return;
    if (gesture.kind === "pan" && gesture.explicit) {
      event.stopPropagation();
      this.armClickGuard();
    }
    if (gesture.kind === "move") this.armClickGuard();
    this.releasePointer(event.pointerId);
    this.setGesture(null);
    this.scheduleSave();
  };

  private onLostCapture = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (gesture && gesture.kind !== "pinch" && gesture.pointerId === event.pointerId) {
      this.setGesture(null);
      this.scheduleSave();
    }
  };

  private onMouseDown = (event: MouseEvent): void => {
    // Some browsers start middle-click autoscroll here regardless of the pointerdown.
    if (event.button === 1) event.preventDefault();
  };

  /** A pan that ends over a link or button must not also activate it. */
  private armClickGuard(): void {
    this.removeClickGuard();
    this.clickGuardActive = true;
    window.addEventListener("click", this.swallowClick, { capture: true });
    window.addEventListener("auxclick", this.swallowClick, { capture: true });
    this.clickGuardTimer = window.setTimeout(() => this.removeClickGuard(), 80);
  }

  private removeClickGuard(): void {
    if (!this.clickGuardActive) return;
    this.clickGuardActive = false;
    window.clearTimeout(this.clickGuardTimer);
    window.removeEventListener("click", this.swallowClick, { capture: true });
    window.removeEventListener("auxclick", this.swallowClick, { capture: true });
  }

  private swallowClick = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    this.removeClickGuard();
  };

  // --- Wheel ------------------------------------------------------------------------------------

  private onWheel = (event: WheelEvent): void => {
    const overOverlay = event.target instanceof Element && event.target.closest(OVERLAY_SELECTOR);
    if (overOverlay && !event.ctrlKey && !event.metaKey) return;
    this.stopFlight();
    const delta = normalizedWheelDelta(event);

    // Chrome reports trackpad pinch as ctrl+wheel, so this one branch covers both.
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const clamped = Math.max(-MAX_WHEEL_ZOOM_DELTA, Math.min(MAX_WHEEL_ZOOM_DELTA, delta.y));
      const anchor = this.toViewportPoint(event.clientX, event.clientY);
      this.setCamera(
        zoomAround(this.camera, anchor, this.camera.zoom * Math.exp(-clamped * WHEEL_ZOOM_SPEED)),
      );
      return;
    }

    // One continuous gesture keeps its owner, so a pan passing over a scroll area doesn't get
    // captured by it, and a scroll hitting its limit doesn't suddenly pan the canvas.
    const owner = this.wheelOwner ?? this.resolveWheelOwner(event.target, delta);
    this.wheelOwner = owner;
    window.clearTimeout(this.wheelTimer);
    this.wheelTimer = window.setTimeout(() => {
      this.wheelOwner = null;
    }, WHEEL_LATCH_MS);

    if (owner === "canvas") {
      event.preventDefault();
      this.panBy(-delta.x, -delta.y);
    }
  };

  private resolveWheelOwner(target: EventTarget | null, delta: Point): WheelOwner {
    if (!(target instanceof Element) || !this.host) return "canvas";
    for (
      let element: Element | null = target;
      element && element !== this.host;
      element = element.parentElement
    ) {
      if (canScrollInDirection(element, delta)) return "native";
    }
    return "canvas";
  }

  // Safari has no ctrl+wheel for pinch and reports it through these non-standard events instead.
  private onSafariGestureStart = (event: Event): void => {
    if (this.touches.size > 0) return;
    event.preventDefault();
    this.stopFlight();
    this.safariGestureZoom = this.camera.zoom;
  };

  private onSafariGestureChange = (event: Event): void => {
    if (this.safariGestureZoom === null) return;
    event.preventDefault();
    const { scale, clientX, clientY } = event as Event & {
      scale: number;
      clientX: number;
      clientY: number;
    };
    const anchor = this.toViewportPoint(clientX, clientY);
    this.setCamera(zoomAround(this.camera, anchor, this.safariGestureZoom * scale));
  };

  private onSafariGestureEnd = (event: Event): void => {
    if (this.safariGestureZoom === null) return;
    event.preventDefault();
    this.safariGestureZoom = null;
  };

  // --- Keyboard ---------------------------------------------------------------------------------

  private canArmSpace(): boolean {
    const active = document.activeElement;
    if (!active || active === document.body || active.hasAttribute(FOCUS_LANDING_ATTRIBUTE)) {
      return true;
    }
    if (!this.viewport?.contains(active)) return false;
    return !active.closest(INTERACTIVE_SELECTOR);
  }

  private onWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.gesture?.kind === "move") {
      // Puts the item back where it was picked up.
      event.preventDefault();
      event.stopPropagation();
      this.gesture.landing = this.gesture.home;
      this.armClickGuard();
      this.releasePointer(this.gesture.pointerId);
      this.setGesture(null);
      return;
    }
    if (event.code !== "Space" || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!this.spaceHeld && !this.canArmSpace()) return;
    this.spaceHeld = true;
    this.syncCursor();
    event.preventDefault();
  };

  private onWindowKeyUp = (event: KeyboardEvent): void => {
    if (event.code !== "Space" || !this.spaceHeld) return;
    this.spaceHeld = false;
    this.syncCursor();
    event.preventDefault();
  };

  /** Canvas shortcuts apply whenever no control holds the keyboard. */
  private onShortcutKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const active = document.activeElement;
    if (active && active !== document.body && !active.hasAttribute(FOCUS_LANDING_ATTRIBUTE)) return;
    const step = event.shiftKey ? 240 : 48;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => this.panBy(step, 0),
      ArrowRight: () => this.panBy(-step, 0),
      ArrowUp: () => this.panBy(0, step),
      ArrowDown: () => this.panBy(0, -step),
      "+": this.zoomIn,
      "=": this.zoomIn,
      "-": this.zoomOut,
      "1": this.fitAll,
      "0": this.resetView,
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    this.stopFlight();
    action();
  };

  private onFocusIn = (event: FocusEvent): void => {
    if (!(event.target instanceof HTMLElement)) return;
    if (this.gesture) return;
    const rect = event.target.getBoundingClientRect();
    const { x: originX, y: originY } = this.viewportOrigin;
    const { width, height } = this.viewportSize;
    const visible =
      rect.left >= originX &&
      rect.top >= originY &&
      rect.right <= originX + width &&
      rect.bottom <= originY + height;
    if (visible) return;
    const { zoom } = this.camera;
    const worldRect = {
      x: (rect.left - originX - this.camera.x) / zoom,
      y: (rect.top - originY - this.camera.y) / zoom,
      width: rect.width / zoom,
      height: rect.height / zoom,
    };
    this.stopFlight();
    this.setCamera(revealCamera(this.camera, worldRect, this.viewportSize, REVEAL_PADDING));
  };

  // --- Navigation -------------------------------------------------------------------------------

  private onDocumentClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>("a[href]");
    if (!link) return;

    const url = new URL(link.href, window.location.href);
    const sameDocument =
      url.origin === window.location.origin && url.pathname === window.location.pathname;
    const targetId = sameDocument ? url.hash.slice(1) : "";
    if (targetId && this.positions.has(targetId)) {
      event.preventDefault();
      this.revealItem(targetId, true);
      return;
    }
    if (link.target === "_blank") return;

    // The canvas is a single page, so anything else would replace the workspace.
    event.preventDefault();
    if (url.origin !== window.location.origin) window.open(url, "_blank", "noopener");
  };

  private onDocumentSubmit = (event: SubmitEvent): void => {
    // A form nobody handled would reload the page and take the workspace with it.
    if (!event.defaultPrevented) event.preventDefault();
  };

  // --- Lifecycle --------------------------------------------------------------------------------

  private onResize = (entries: ResizeObserverEntry[]): void => {
    for (const entry of entries) {
      if (entry.target === this.viewport) this.measureViewport();
      else this.boundsDirty = true;
    }
  };

  private onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") {
      this.cancelInput();
      this.flushSave();
    }
  };

  private cancelInput = (): void => {
    const gesture = this.gesture;
    if (gesture && gesture.kind !== "pinch") this.releasePointer(gesture.pointerId);
    for (const pointerId of this.touches.keys()) this.releasePointer(pointerId);
    this.setGesture(null);
    this.touches.clear();
    this.spaceHeld = false;
    this.syncCursor();
    this.wheelOwner = null;
    this.safariGestureZoom = null;
  };

  private applyPreferences = (): void => {
    const { theme, accent } = this.preferences;
    const root = document.documentElement;
    const dark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);
    root.dataset.accent = accent;
    applyMotionTuning(this.preferences.motion);
  };

  private scheduleSave(): void {
    if (this.saveTimer !== undefined) return;
    this.saveTimer = window.setTimeout(this.flushSave, SAVE_DELAY_MS);
  }

  private flushSave = (): void => {
    if (this.saveTimer === undefined) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    writeLayout(
      serializeLayout({
        camera: this.camera,
        preferences: this.preferences,
        positions: this.positions,
      }),
    );
  };
}
