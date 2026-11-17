import { reportFrontendError } from "../lib/app-api";

export function reportError(
  kind: string,
  message: string,
  stack?: string,
  componentStack?: string,
) {
  void reportFrontendError({
    kind,
    message,
    stack,
    componentStack,
    route: window.location.hash || window.location.pathname,
  });
}

let installed = false;

export function installGlobalErrorReporting() {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;
  window.addEventListener("error", (event) => {
    reportError(
      "window_error",
      event.error instanceof Error ? event.error.message : event.message,
      event.error instanceof Error ? event.error.stack : undefined,
    );
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportError(
      "unhandled_rejection",
      reason instanceof Error ? reason.message : String(reason),
      reason instanceof Error ? reason.stack : undefined,
    );
  });
}
