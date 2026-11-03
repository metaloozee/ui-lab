import { animate } from "motion";

import { spring } from "@/lib/springs";

import type { Point } from "./geometry";

/** How an item looks right now, while its committed position may already be somewhere else. */
export type ItemPose = Point & { lift: number };

/**
 * Fixed rather than read from the spring tokens: a carried item has to feel attached to the pointer
 * whatever Feel and Speed are set to.
 */
const PULL_RATE = 60;
const LIFT_RATE = 28;
const MAX_THROW_SPEED = 2800;

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
/** Frame-rate independent easing toward a target. */
const approach = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

type Carried = { id: string; target: Point; pull: Point; goalPull: Point; velocity: Point };
type Settling = { stop: () => void };

/**
 * The physics of one item being carried and any number settling. Dropping hands the release
 * velocity to real springs, which follow Feel and Speed in Inspect.
 */
export class ItemMotion {
  private readonly poses = new Map<string, ItemPose>();
  private readonly settling = new Map<string, Settling>();
  private readonly dirty = new Set<string>();
  private carried: Carried | null = null;
  private frame: number | null = null;
  private lastTime = 0;

  private readonly paint: (id: string) => void;
  private readonly beforeFrame: (dt: number) => void;
  private readonly isReduced: () => boolean;

  constructor(
    paint: (id: string) => void,
    beforeFrame: (dt: number) => void,
    isReduced: () => boolean,
  ) {
    this.paint = paint;
    this.beforeFrame = beforeFrame;
    this.isReduced = isReduced;
  }

  pose(id: string): ItemPose | undefined {
    return this.poses.get(id);
  }

  pickUp(id: string, from: Point): void {
    this.settling.get(id)?.stop();
    this.settling.delete(id);
    const pose = this.poses.get(id) ?? { ...from, lift: 0 };
    this.poses.set(id, pose);
    this.carried = {
      id,
      target: { x: pose.x, y: pose.y },
      pull: { x: 0, y: 0 },
      goalPull: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
    };
    this.run();
  }

  /** `target` is exactly where the pointer has it, and `pull` is the magnet's offset from there. */
  carryTo(target: Point, pull: Point): void {
    if (!this.carried) return;
    this.carried.target = target;
    this.carried.goalPull = pull;
  }

  /** Lets go, keeping the momentum of the throw. Calls back once the item has fully landed. */
  drop(target: Point, onLanded: () => void): void {
    const carried = this.carried;
    if (!carried) return;
    this.carried = null;
    const throwSpeed = {
      x: clamp(carried.velocity.x, MAX_THROW_SPEED),
      y: clamp(carried.velocity.y, MAX_THROW_SPEED),
    };
    this.settle(carried.id, target, spring.slow, throwSpeed, onLanded);
  }

  /** A short move with no pickup, such as an arrow key. */
  glide(id: string, from: Point, target: Point): void {
    this.settling.get(id)?.stop();
    const pose = this.poses.get(id) ?? { ...from, lift: 0 };
    this.poses.set(id, pose);
    this.settle(id, target, spring.moderate, { x: 0, y: 0 }, () => undefined);
  }

  /** Ends everything at once and leaves items at their committed positions. */
  stopAll(): void {
    this.carried = null;
    for (const settling of this.settling.values()) settling.stop();
    this.settling.clear();
    const ids = [...this.poses.keys()];
    this.poses.clear();
    for (const id of ids) this.paint(id);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private settle(
    id: string,
    target: Point,
    tier: { duration: number; bounce: number },
    velocity: Point,
    onLanded: () => void,
  ): void {
    const pose = this.poses.get(id);
    if (!pose) return;
    const finish = () => {
      this.settling.delete(id);
      this.poses.delete(id);
      this.paint(id);
      onLanded();
    };
    if (this.isReduced()) {
      finish();
      return;
    }

    const value = (key: keyof ItemPose, to: number, options: Record<string, number>) =>
      animate(pose[key], to, {
        type: "spring",
        ...options,
        onUpdate: (latest: number) => {
          pose[key] = latest;
          this.dirty.add(id);
        },
      });
    const shape = { duration: tier.duration, bounce: tier.bounce };
    const soft = { duration: spring.moderate.duration, bounce: 0 };
    const animations = [
      value("x", target.x, { ...shape, velocity: velocity.x }),
      value("y", target.y, { ...shape, velocity: velocity.y }),
      value("lift", 0, soft),
    ];

    let stopped = false;
    this.settling.set(id, {
      stop: () => {
        stopped = true;
        for (const animation of animations) animation.stop();
      },
    });
    void Promise.all(animations).then(() => {
      if (!stopped) finish();
    });
    this.run();
  }

  private run(): void {
    if (this.frame !== null) return;
    this.lastTime = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    // A stalled tab shouldn't turn into one enormous step.
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.beforeFrame(dt);

    if (this.carried) this.stepCarried(this.carried, dt);
    for (const id of this.dirty) this.paint(id);
    this.dirty.clear();

    this.frame = this.carried || this.settling.size > 0 ? requestAnimationFrame(this.tick) : null;
  };

  private stepCarried(carried: Carried, dt: number): void {
    const pose = this.poses.get(carried.id);
    if (!pose) return;
    const { x: previousX, y: previousY } = pose;

    // The pointer is followed exactly. Only the magnet eases, so it has no hard edge and no lag.
    const reduced = this.isReduced();
    const rate = reduced ? Infinity : PULL_RATE;
    carried.pull.x = approach(carried.pull.x, carried.goalPull.x, rate, dt);
    carried.pull.y = approach(carried.pull.y, carried.goalPull.y, rate, dt);
    pose.x = carried.target.x + carried.pull.x;
    pose.y = carried.target.y + carried.pull.y;
    if (!reduced) pose.lift = approach(pose.lift, 1, LIFT_RATE, dt);

    carried.velocity = {
      x: approach(carried.velocity.x, (pose.x - previousX) / dt, 30, dt),
      y: approach(carried.velocity.y, (pose.y - previousY) / dt, 30, dt),
    };
    this.dirty.add(carried.id);
  }
}
