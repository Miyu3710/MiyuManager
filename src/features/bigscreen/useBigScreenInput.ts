import { useCallback, useEffect, useRef, useState } from "react";

export type BigScreenAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "confirm"
  | "back"
  | "menu"
  | "control"
  | "prevZone"
  | "nextZone";

export type GamepadDirection = "up" | "down" | "left" | "right";

export const GAMEPAD_BUTTONS = {
  confirm: 0,
  back: 1,
  menu: 3,
  prevZone: 4,
  nextZone: 5,
  control: 9,
} as const;

export interface GamepadSnapshot {
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>;
  axes: ReadonlyArray<number>;
}

function isPressed(button: { pressed: boolean; value: number } | undefined): boolean {
  return Boolean(button && (button.pressed || button.value > 0.5));
}

export function readGamepadDirection(pad: GamepadSnapshot): GamepadDirection | null {
  const dpadUp = isPressed(pad.buttons[12]);
  const dpadDown = isPressed(pad.buttons[13]);
  const dpadLeft = isPressed(pad.buttons[14]);
  const dpadRight = isPressed(pad.buttons[15]);
  if (dpadUp && !dpadDown) return "up";
  if (dpadDown && !dpadUp) return "down";
  if (dpadLeft && !dpadRight) return "left";
  if (dpadRight && !dpadLeft) return "right";

  const x = pad.axes[0] ?? 0;
  const y = pad.axes[1] ?? 0;
  const deadzone = 0.55;
  if (Math.abs(x) < deadzone && Math.abs(y) < deadzone) {
    return null;
  }
  if (Math.abs(x) >= Math.abs(y)) {
    return x > 0 ? "right" : "left";
  }
  return y > 0 ? "down" : "up";
}

export interface GamepadStatus {
  supported: boolean;
  connected: boolean;
  index: number | null;
  id: string | null;
  mapping: string | null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

interface UseBigScreenInputOptions {
  enabled: boolean;
  onAction: (action: BigScreenAction) => void;
  onActivity?: () => void;
}

export function useBigScreenInput({ enabled, onAction, onActivity }: UseBigScreenInputOptions) {
  const actionRef = useRef(onAction);
  const activityRef = useRef(onActivity);
  const [status, setStatus] = useState<GamepadStatus>(() => ({
    supported: typeof navigator !== "undefined" && typeof navigator.getGamepads === "function",
    connected: false,
    index: null,
    id: null,
    mapping: null,
  }));

  useEffect(() => {
    actionRef.current = onAction;
    activityRef.current = onActivity;
  });

  const dispatch = useCallback((action: BigScreenAction) => {
    actionRef.current(action);
    activityRef.current?.();
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }
      const key = event.key;
      let action: BigScreenAction | null = null;
      if (key === "ArrowUp") action = "up";
      else if (key === "ArrowDown") action = "down";
      else if (key === "ArrowLeft") action = "left";
      else if (key === "ArrowRight") action = "right";
      else if (key === "Enter" || key === " ") action = "confirm";
      else if (key === "Escape" || key === "Backspace") action = "back";
      else if (key.toLowerCase() === "c" || (key === "F10" && event.shiftKey)) action = "menu";
      else if (key.toLowerCase() === "m") action = "control";
      else if (key === "Tab") action = event.shiftKey ? "prevZone" : "nextZone";

      if (!action) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      dispatch(action);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [dispatch, enabled]);

  useEffect(() => {
    if (
      !enabled ||
      typeof navigator === "undefined" ||
      typeof navigator.getGamepads !== "function"
    ) {
      return;
    }

    let frame = 0;
    let stopped = false;
    let currentIndex: number | null = null;
    let heldDirection: GamepadDirection | null = null;
    let nextRepeat = 0;
    const lastButtons = new Map<number, boolean>();

    const updateStatus = (pad: Gamepad | null) => {
      setStatus((previous) => {
        const next = {
          supported: true,
          connected: Boolean(pad),
          index: pad?.index ?? null,
          id: pad?.id ?? null,
          mapping: pad?.mapping ?? null,
        };
        if (
          previous.connected === next.connected &&
          previous.index === next.index &&
          previous.id === next.id &&
          previous.mapping === next.mapping
        ) {
          return previous;
        }
        return next;
      });
    };

    const poll = (now: number) => {
      if (stopped) return;
      let pads: Array<Gamepad | null> = [];
      try {
        pads = navigator.getGamepads();
      } catch {
        pads = [];
      }
      const pad = pads.find((entry) => entry?.connected) ?? null;
      if (pad?.index !== currentIndex) {
        currentIndex = pad?.index ?? null;
        heldDirection = null;
        lastButtons.clear();
      }
      updateStatus(pad);

      if (pad) {
        const direction = readGamepadDirection(pad);
        if (direction) {
          const fresh = direction !== heldDirection;
          if (fresh || now >= nextRepeat) {
            dispatch(direction);
            nextRepeat = now + (fresh ? 330 : 115);
          }
          heldDirection = direction;
        } else {
          heldDirection = null;
        }

        for (const [action, index] of Object.entries(GAMEPAD_BUTTONS) as Array<
          [BigScreenAction, number]
        >) {
          const pressed = isPressed(pad.buttons[index]);
          if (pressed && !lastButtons.get(index)) {
            dispatch(action);
          }
          lastButtons.set(index, pressed);
        }
      }

      frame = window.requestAnimationFrame(poll);
    };

    const updateFromEvent = () => {
      try {
        const pad = navigator.getGamepads().find((entry) => entry?.connected) ?? null;
        updateStatus(pad);
      } catch {
        updateStatus(null);
      }
    };

    frame = window.requestAnimationFrame(poll);
    window.addEventListener("gamepadconnected", updateFromEvent);
    window.addEventListener("gamepaddisconnected", updateFromEvent);

    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("gamepadconnected", updateFromEvent);
      window.removeEventListener("gamepaddisconnected", updateFromEvent);
    };
  }, [dispatch, enabled]);

  return status;
}
