import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./app/App";
import "./styles/global.css";

if (isTauri() && ["bigscreen", "bigscreen-probe"].includes(getCurrentWindow().label)) {
  window.location.hash = "#/big-screen";
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

requestAnimationFrame(() => {
  document.documentElement.dataset.ready = "true";
});
