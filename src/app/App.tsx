import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import type { ReactNode } from "react";
import { createHashRouter, Navigate, RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppShell } from "./AppShell";
import { HomePage } from "../features/home/HomePage";
import { LibraryPage } from "../features/library/LibraryPage";
import { WorkDetailPage } from "../features/work-detail/WorkDetailPage";
import { StatsPage } from "../features/stats/StatsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { BigScreenPage } from "../features/bigscreen/BigScreenPage";

const PrototypeGallery = lazy(() =>
  import("../features/prototypes/gallery/PrototypeGallery").then((module) => ({
    default: module.PrototypeGallery,
  })),
);
const PrototypeHost = lazy(() =>
  import("../features/prototypes/PrototypeHost").then((module) => ({
    default: module.PrototypeHost,
  })),
);

function PrototypeRoute({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="prototype-loading">加载原型…</div>}>{children}</Suspense>
  );
}

const queryClient = new QueryClient();

const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "library", element: <LibraryPage /> },
      { path: "work/:id", element: <WorkDetailPage /> },
      { path: "stats", element: <StatsPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
  { path: "/big-screen", element: <BigScreenPage /> },
  {
    path: "/design-prototypes",
    element: (
      <PrototypeRoute>
        <PrototypeGallery />
      </PrototypeRoute>
    ),
  },
  {
    path: "/prototype/:direction",
    element: (
      <PrototypeRoute>
        <PrototypeHost />
      </PrototypeRoute>
    ),
  },
  {
    path: "/prototype/:direction/library",
    element: (
      <PrototypeRoute>
        <PrototypeHost />
      </PrototypeRoute>
    ),
  },
  {
    path: "/prototype/:direction/work/:workId",
    element: (
      <PrototypeRoute>
        <PrototypeHost />
      </PrototypeRoute>
    ),
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

function useRevealWindow() {
  useEffect(() => {
    document.documentElement.dataset.ready = "true";

    if (!isTauri()) {
      return;
    }

    const currentWindow = getCurrentWindow();
    void currentWindow
      .show()
      .then(() => currentWindow.setFocus())
      .catch(() => undefined);
  }, []);
}

export default function App() {
  useRevealWindow();

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          className: "miyu-toast",
        }}
      />
    </QueryClientProvider>
  );
}
