import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import type { ReactNode } from "react";
import { createHashRouter, Navigate, RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppShell } from "./AppShell";
import { HomePage } from "../features/home/HomePage";
import { useAppInfo } from "../features/library/useLibrary";

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
const CollectionsPage = lazy(() =>
  import("../features/collections/CollectionsPage").then((module) => ({
    default: module.CollectionsPage,
  })),
);
const OnboardingPage = lazy(() =>
  import("../features/onboarding/OnboardingPage").then((module) => ({
    default: module.OnboardingPage,
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

function OnboardedShell() {
  const appInfo = useAppInfo();
  if (appInfo.isPending) {
    return (
      <div className="app-boot" aria-busy="true">
        <span>M</span>
        <p>正在读取本地游戏库…</p>
      </div>
    );
  }
  if (appInfo.data && !appInfo.data.onboardingCompleted && appInfo.data.libraryCount === 0) {
    return <Navigate to="/onboarding" replace />;
  }
  return <AppShell />;
}

const queryClient = new QueryClient();

const router = createHashRouter([
  {
    path: "/",
    element: <OnboardedShell />,
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
        path: "collections",
        element: (
          <PageRoute>
            <CollectionsPage />
          </PageRoute>
        ),
      },
      {
        path: "collections/:id",
        element: (
          <PageRoute>
            <CollectionsPage />
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
    path: "/onboarding",
    element: (
      <PageRoute>
        <OnboardingPage />
      </PageRoute>
    ),
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

function useMainWindowBridge() {
  useEffect(() => {
    if (!isTauri() || getCurrentWindow().label !== "main") {
      return;
    }

    let unlisten: (() => void) | undefined;
    void listen<{ workId: number }>("bigscreen-open-detail", (event) => {
      window.location.hash = "#/work/" + event.payload.workId;
    }).then((cleanup) => {
      unlisten = cleanup;
    });

    return () => unlisten?.();
  }, []);
}

export default function App() {
  useRevealWindow();
  useMainWindowBridge();

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster
        position="bottom-left"
        theme="light"
        toastOptions={{
          className: "miyu-toast",
        }}
      />
    </QueryClientProvider>
  );
}
