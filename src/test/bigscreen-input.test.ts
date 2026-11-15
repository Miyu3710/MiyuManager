import { describe, expect, it } from "vitest";
import {
  GAMEPAD_BUTTONS,
  readGamepadDirection,
  type GamepadSnapshot,
} from "../features/bigscreen/useBigScreenInput";

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

  it("keeps X unused while Y and Start have explicit actions", () => {
    expect(GAMEPAD_BUTTONS).toEqual({
      confirm: 0,
      back: 1,
      menu: 3,
      prevZone: 4,
      nextZone: 5,
      control: 9,
    });
    expect(Object.values(GAMEPAD_BUTTONS)).not.toContain(2);
  });
});
