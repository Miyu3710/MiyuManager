import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "@fontsource-variable/noto-serif-sc";
import "@fontsource-variable/noto-sans-sc";
import "@fontsource-variable/manrope";
import "./styles/global.css";
import "./styles/sakura.css";
import App from "./app/App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { installGlobalErrorReporting } from "./app/error-reporting";
import "./design-system/atelier.css";

if (isTauri() && ["bigscreen", "bigscreen-probe"].includes(getCurrentWindow().label)) {
  window.location.hash = "#/big-screen";
}

if (!window.location.hash || window.location.hash === "#" || window.location.hash === "#/") {
  const lastRoute = window.localStorage.getItem("miyu-last-route");
  if (lastRoute?.startsWith("/") && !lastRoute.startsWith("//")) {
    window.location.hash = "#" + lastRoute;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

installGlobalErrorReporting();

requestAnimationFrame(() => {
  document.documentElement.dataset.ready = "true";
});
