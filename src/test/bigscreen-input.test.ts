import { describe, expect, it } from "vitest";
import {
  GAMEPAD_BUTTONS,
  readGamepadDirection,
  type GamepadSnapshot,
} from "../features/bigscreen/useBigScreenInput";
import { adjacentCategory } from "../features/bigscreen/bigscreenCategories";

function pad(pressed: number[], axes: number[] = [0, 0]): GamepadSnapshot {
  return {
    buttons: Array.from({ length: 16 }, (_, index) => ({
      pressed: pressed.includes(index),
      value: pressed.includes(index) ? 1 : 0,
    })),
    axes,
  };
}

describe("big screen gamepad mapping", () => {
  it("maps the D-pad and left stick with a deadzone", () => {
    expect(readGamepadDirection(pad([12]))).toBe("up");
    expect(readGamepadDirection(pad([13]))).toBe("down");
    expect(readGamepadDirection(pad([14]))).toBe("left");
    expect(readGamepadDirection(pad([15]))).toBe("right");
    expect(readGamepadDirection(pad([], [0.82, 0.1]))).toBe("right");
    expect(readGamepadDirection(pad([], [-0.82, 0.1]))).toBe("left");
    expect(readGamepadDirection(pad([], [0.1, -0.82]))).toBe("up");
    expect(readGamepadDirection(pad([], [0.1, 0.82]))).toBe("down");
    expect(readGamepadDirection(pad([], [0.31, -0.28]))).toBeNull();
  });

  it("maps X to backspace and the shoulder buttons to categories", () => {
    expect(GAMEPAD_BUTTONS).toEqual({
      confirm: 0,
      back: 1,
      backspace: 2,
      menu: 3,
      prevCategory: 4,
      nextCategory: 5,
      prevPage: 6,
      nextPage: 7,
      search: 8,
      control: 9,
    });
    expect(GAMEPAD_BUTTONS.backspace).toBe(2);
  });

  it("cycles sidebar categories in both directions with wraparound", () => {
    expect(adjacentCategory("recent", 1)).toBe("playing");
    expect(adjacentCategory("recent", -1)).toBe("all");
    expect(adjacentCategory("all", 1)).toBe("recent");
  });
});
