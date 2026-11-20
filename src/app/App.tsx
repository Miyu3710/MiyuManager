import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import type { ReactNode } from "react";
import { createHashRouter, Navigate, RouterProvider } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppShell } from "./AppShell";
import { HintProvider } from "../design-system/components/Hint";
import { HomePage } from "../features/home/HomePage";
import { useAppInfo } from "../features/library/useLibrary";
import { useAutomaticUpdates } from "./useAutomaticUpdates";
import { ScreenshotToastPage } from "../features/screenshots/ScreenshotToastPage";

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

const ScreenshotsPage = lazy(() =>
  import("../features/screenshots/ScreenshotsPage").then((module) => ({
    default: module.ScreenshotsPage,
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
        <img src="/miyu-manager.png" alt="" aria-hidden="true" />
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
        path: "screenshots",
        element: (
          <PageRoute>
            <ScreenshotsPage />
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
    let cancelled = false;
    const reveal = () => {
      if (cancelled) {
        return;
      }
      void currentWindow
        .show()
        .then(() => currentWindow.setFocus())
        .catch(() => undefined);
    };
    void invoke<boolean>("startup_silent")
      .then((silent) => {
        if (!silent) {
          reveal();
        }
      })
      .catch(reveal);

    return () => {
      cancelled = true;
    };
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

function useLaunchWarnings() {
  useEffect(() => {
    if (!isTauri() || getCurrentWindow().label !== "main") {
      return;
    }

    let unlisten: (() => void) | undefined;
    void listen<{ workId: number; message: string }>("launch-warning", (event) => {
      toast.warning(event.payload.message, { id: `launch-warning-${event.payload.workId}` });
    }).then((cleanup) => {
      unlisten = cleanup;
    });

    return () => unlisten?.();
  }, []);
}

function useScreenshotEvents() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isTauri() || getCurrentWindow().label !== "main") {
      return;
    }
    let unlisten: (() => void) | undefined;
    void listen("screenshot-captured", () => {
      void queryClient.invalidateQueries({ queryKey: ["screenshots"] });
    }).then((cleanup) => {
      unlisten = cleanup;
    });
    return () => unlisten?.();
  }, [queryClient]);
  return null;
}

function MainWindowApp() {
  useRevealWindow();
  useMainWindowBridge();
  useLaunchWarnings();
  useAutomaticUpdates();

  return (
    <QueryClientProvider client={queryClient}>
      <ScreenshotEvents />
      <HintProvider>
        <RouterProvider router={router} />
        <Toaster
          position="bottom-right"
          offset={18}
          theme="light"
          toastOptions={{
            className: "miyu-toast",
          }}
        />
      </HintProvider>
    </QueryClientProvider>
  );
}

function ScreenshotEvents() {
  useScreenshotEvents();
  return null;
}

function windowLabel(): string {
  if (window.location.hash.startsWith("#/screenshot-toast")) {
    return "screenshot-toast";
  }
  if (!isTauri()) {
    return "main";
  }
  try {
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
}

export default function App() {
  if (
    windowLabel().startsWith("screenshot-toast") ||
    window.location.hash.startsWith("#/screenshot-toast")
  ) {
    return <ScreenshotToastPage />;
  }
  return <MainWindowApp />;
}
