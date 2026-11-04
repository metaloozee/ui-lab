import { describe, expect, it } from "vite-plus/test";

import { walletLayout } from "./wallet";

const CARD_HEIGHT = 182;
const HOLDER_HEIGHT = 172;

describe.each([1, 2, 4, 5])("walletLayout with %i cards", (count) => {
  const layout = walletLayout(count);
  const indexes = Array.from({ length: count }, (_, index) => index);

  it("keeps the resting hit area inside the risen one, so hover can't flicker", () => {
    const { rest, fan } = layout.hitArea;
    expect(rest.top).toBeGreaterThanOrEqual(fan.top);
    expect(rest.left).toBeGreaterThanOrEqual(fan.left);
    expect(rest.top + rest.height).toBeLessThanOrEqual(fan.top + fan.height);
    expect(rest.left + rest.width).toBeLessThanOrEqual(fan.left + fan.width);
  });

  it("never lets a stored card poke out below the holder", () => {
    for (const index of indexes) {
      const rest = layout.card.rest(index);
      const tucked = layout.card.tucked(index);
      expect(rest.y + CARD_HEIGHT * rest.scale).toBeLessThanOrEqual(
        layout.holder.rest.y + HOLDER_HEIGHT,
      );
      expect(tucked.y + CARD_HEIGHT * tucked.scale).toBeLessThanOrEqual(
        layout.holder.open.y + HOLDER_HEIGHT * layout.holder.open.scale,
      );
    }
  });

  it("clears the receded holder with the open card, and fits everything on stage", () => {
    const open = layout.card.open();
    expect(open.y + CARD_HEIGHT).toBeLessThan(layout.holder.open.y);
    expect(open.y).toBeGreaterThanOrEqual(0);
    expect(layout.holder.fan.y + HOLDER_HEIGHT).toBeLessThanOrEqual(layout.stageHeight);
    expect(layout.holder.open.y + HOLDER_HEIGHT * layout.holder.open.scale).toBeLessThanOrEqual(
      layout.stageHeight,
    );
  });
});
