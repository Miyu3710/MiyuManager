import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import type { ReactNode } from "react";
import { createHashRouter, Navigate, RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppShell } from "./AppShell";
import { HomePage } from "../features/home/HomePage";

const LibraryPage = lazy(() =>
  import("../features/library/LibraryPage").then((module) => ({ default: module.LibraryPage })),
);
const WorkDetailPage = lazy(() =>
  import("../features/work-detail/WorkDetailPage").then((module) => ({
    default: module.WorkDetailPage,
  })),
);
const StatsPage = lazy(() =>
  import("../features/stats/StatsPage").then((module) => ({ default: module.StatsPage })),
);
const SettingsPage = lazy(() =>
  import("../features/settings/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);
const BigScreenPage = lazy(() =>
  import("../features/bigscreen/BigScreenPage").then((module) => ({
    default: module.BigScreenPage,
  })),
);

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

function PageRoute({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="page-loading">正在读取本地库…</div>}>{children}</Suspense>
  );
}

const queryClient = new QueryClient();

const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: "library",
        element: (
          <PageRoute>
            <LibraryPage />
          </PageRoute>
        ),
      },
      {
        path: "work/:id",
        element: (
          <PageRoute>
            <WorkDetailPage />
          </PageRoute>
        ),
      },
      {
        path: "stats",
        element: (
          <PageRoute>
            <StatsPage />
          </PageRoute>
        ),
      },
      {
        path: "settings",
        element: (
          <PageRoute>
            <SettingsPage />
          </PageRoute>
        ),
      },
    ],
  },
  {
    path: "/big-screen",
    element: (
      <PageRoute>
        <BigScreenPage />
      </PageRoute>
    ),
  },
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
