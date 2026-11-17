import { useEffect } from "react";
import { useLocation } from "react-router-dom";

interface DeepLinkFocusOptions {
  param?: string;
  ready?: boolean;
}

export function useDeepLinkFocus({ param = "focus", ready = true }: DeepLinkFocusOptions = {}) {
  const location = useLocation();
  const queryTarget = new URLSearchParams(location.search).get(param);
  const hashTarget = location.hash.replace(/^#/, "");
  const target = queryTarget || hashTarget || null;

  useEffect(() => {
    if (!target || !ready) {
      return;
    }
    let cancelled = false;
    let timer = 0;
    let attempts = 0;
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";

    const scroll = () => {
      if (cancelled) {
        return;
      }
      const element = document.getElementById(target);
      if (!element) {
        attempts += 1;
        if (attempts < 50) {
          timer = window.setTimeout(scroll, 60);
        }
        return;
      }
      element.scrollIntoView({ behavior, block: "start" });
    };

    scroll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ready, target]);
}
