import { useCallback, useRef, useState } from "react";

export type FocusDirection = "up" | "down" | "left" | "right";
export type FocusScope = "root" | "game-menu" | "drawer" | "control";

function isVisible(element: HTMLElement): boolean {
  let node: HTMLElement | null = element;
  while (node) {
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    node = node.parentElement;
  }
  return true;
}

function focusWithoutScroll(element: HTMLElement) {
  element.focus({ preventScroll: true });
  if (typeof element.scrollIntoView === "function") {
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function nearestByHorizontalCenter(
  elements: HTMLElement[],
  current: HTMLElement,
): HTMLElement | null {
  const currentRect = current.getBoundingClientRect();
  const center = currentRect.left + currentRect.width / 2;
  let best: { element: HTMLElement; distance: number } | null = null;
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    const elementCenter = rect.left + rect.width / 2;
    const distance = Math.abs(elementCenter - center);
    if (!best || distance < best.distance) {
      best = { element, distance };
    }
  }
  return best?.element ?? null;
}

export function useBigScreenFocus(scope: FocusScope) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeKey, setActiveKeyState] = useState<string | null>(null);
  const activeKeyRef = useRef<string | null>(null);
  const lastZoneFocus = useRef<Record<string, string>>({});

  const setActiveKey = useCallback((key: string | null) => {
    activeKeyRef.current = key;
    setActiveKeyState(key);
  }, []);

  const scopeRoot = useCallback((): HTMLElement | null => {
    if (scope === "root") {
      return rootRef.current;
    }
    return document.querySelector<HTMLElement>(`[data-bigscreen-scope="${scope}"]`);
  }, [scope]);

  const focusables = useCallback((): HTMLElement[] => {
    const root = scopeRoot();
    if (!root) {
      return [];
    }
    return Array.from(root.querySelectorAll<HTMLElement>("[data-bigscreen-focus]")).filter(
      (element) =>
        !element.hasAttribute("disabled") &&
        element.getAttribute("aria-hidden") !== "true" &&
        isVisible(element),
    );
  }, [scopeRoot]);

  const focusElement = useCallback(
    (element: HTMLElement) => {
      focusWithoutScroll(element);
      if (document.activeElement !== element) {
        return;
      }
      const key = element.dataset.bigscreenFocus ?? null;
      const zone = element.dataset.bigscreenZone;
      if (key && zone) {
        lastZoneFocus.current[zone] = key;
      }
      setActiveKey(key);
    },
    [setActiveKey],
  );

  const focusFirst = useCallback(() => {
    const list = focusables();
    if (list[0]) {
      focusElement(list[0]);
      return true;
    }
    return false;
  }, [focusElement, focusables]);

  const focusKey = useCallback(
    (key: string | null | undefined) => {
      if (key) {
        const list = focusables();
        const target = list.find((element) => element.dataset.bigscreenFocus === key);
        if (target) {
          focusElement(target);
          return true;
        }
      }
      return focusFirst();
    },
    [focusElement, focusFirst, focusables],
  );

  const move = useCallback(
    (direction: FocusDirection) => {
      const list = focusables();
      if (list.length === 0) {
        return;
      }
      const current =
        list.find((element) => element === document.activeElement) ??
        list.find((element) => element.dataset.bigscreenFocus === activeKeyRef.current) ??
        list[0];
      if (!current) {
        return;
      }

      const zone = current.dataset.bigscreenZone ?? "";
      const zoneElements = list.filter((element) => element.dataset.bigscreenZone === zone);
      const index = zoneElements.indexOf(current);
      const horizontal = direction === "left" || direction === "right";
      const rootZone = zone === "categories" || zone === "hero" || zone === "shelf";

      if (!rootZone) {
        if (horizontal) {
          return;
        }
        const offset = direction === "down" ? 1 : -1;
        const target = zoneElements[index + offset];
        if (target) {
          focusElement(target);
        }
        return;
      }

      const activeCategory = () =>
        list.find(
          (element) =>
            element.dataset.bigscreenZone === "categories" &&
            element.getAttribute("aria-current") === "page",
        ) ?? list.find((element) => element.dataset.bigscreenZone === "categories");

      if (zone === "categories") {
        if (direction === "up" || direction === "down") {
          const offset = direction === "down" ? 1 : -1;
          const target = zoneElements[index + offset];
          if (target) {
            focusElement(target);
          }
          return;
        }
        if (direction === "right") {
          const heroElements = list.filter((element) => element.dataset.bigscreenZone === "hero");
          const remembered = lastZoneFocus.current.hero;
          const target =
            heroElements.find((element) => element.dataset.bigscreenFocus === remembered) ??
            heroElements[0];
          if (target) {
            focusElement(target);
          }
        }
        return;
      }

      if (zone === "hero") {
        if (horizontal) {
          const offset = direction === "right" ? 1 : -1;
          const target = zoneElements[index + offset];
          if (target) {
            focusElement(target);
            return;
          }
          if (direction === "left") {
            const target = activeCategory();
            if (target) {
              focusElement(target);
            }
          }
          return;
        }
        if (direction === "up") {
          const target = activeCategory();
          if (target) {
            focusElement(target);
          }
          return;
        }
        if (direction === "down") {
          const shelf = list.filter((element) => element.dataset.bigscreenZone === "shelf");
          const target = nearestByHorizontalCenter(shelf, current);
          if (target) {
            focusElement(target);
          }
        }
        return;
      }

      if (zone === "shelf") {
        if (horizontal) {
          const offset = direction === "right" ? 1 : -1;
          const target = zoneElements[index + offset];
          if (target) {
            focusElement(target);
          }
          return;
        }
        if (direction === "up") {
          const heroElements = list.filter((element) => element.dataset.bigscreenZone === "hero");
          const remembered = lastZoneFocus.current.hero;
          const target =
            heroElements.find((element) => element.dataset.bigscreenFocus === remembered) ??
            heroElements[0];
          if (target) {
            focusElement(target);
          }
        }
      }
    },
    [focusElement, focusables],
  );

  const switchZone = useCallback(
    (direction: "prev" | "next") => {
      const list = focusables();
      if (list.length === 0) {
        return;
      }
      const current = list.find((element) => element === document.activeElement) ?? list[0];
      if (!current) {
        return;
      }
      const zones = Array.from(
        new Set(
          list
            .map((element) => element.dataset.bigscreenZone)
            .filter((zone): zone is string => Boolean(zone)),
        ),
      );
      if (zones.length < 2) {
        return;
      }
      const currentZone = current.dataset.bigscreenZone ?? zones[0] ?? "";
      const index = Math.max(0, zones.indexOf(currentZone));
      const offset = direction === "next" ? 1 : -1;
      const targetZone = zones[(index + offset + zones.length) % zones.length];
      if (!targetZone) {
        return;
      }
      const remembered = lastZoneFocus.current[targetZone];
      const target =
        list.find((element) => element.dataset.bigscreenFocus === remembered) ??
        list.find((element) => element.dataset.bigscreenZone === targetZone);
      if (target) {
        focusElement(target);
      }
    },
    [focusElement, focusables],
  );

  return {
    rootRef,
    activeKey,
    setActiveKey,
    focusFirst,
    focusKey,
    move,
    switchZone,
  };
}
