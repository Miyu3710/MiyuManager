import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelLibraryScan,
  importLibraryCandidates,
  pickLibraryRoot,
  previewScanCandidates,
  startLibraryScan,
} from "../../lib/library-api";
import type {
  ImportCandidateInput,
  ImportResult,
  ScanCandidate,
  ScanComplete,
  ScanErrorEvent,
  ScanProgress,
} from "../../lib/library-types";
import { useInvalidateLibrary } from "./useLibrary";

export type ScanView =
  | { status: "idle" }
  | {
      status: "scanning";
      rootPath: string;
      jobId: string | null;
      progress: ScanProgress | null;
      cancelling?: boolean;
    }
  | {
      status: "review";
      rootPath: string;
      candidates: ScanCandidate[];
      cancelled: boolean;
      stats: ScanComplete | null;
    }
  | { status: "error"; rootPath: string; message: string };

function describeError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "未知错误";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function useLibraryScan() {
  const [state, setState] = useState<ScanView>({ status: "idle" });
  const [importing, setImporting] = useState(false);
  const activeJob = useRef<string | null>(null);
  const acceptingEvents = useRef(true);
  const runToken = useRef(0);
  const invalidate = useInvalidateLibrary();

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let active = true;
    const unlisteners: UnlistenFn[] = [];
    const register = <T>(eventName: string, handler: (payload: T) => void) => {
      void listen<T>(eventName, (event) => {
        if (active) {
          handler(event.payload);
        }
      }).then((unlisten) => {
        if (active) {
          unlisteners.push(unlisten);
        } else {
          unlisten();
        }
      });
    };

    register<ScanProgress>("library-scan-progress", (progress) => {
      if (!acceptingEvents.current) {
        return;
      }
      setState((previous) =>
        previous.status === "scanning"
          ? {
              ...previous,
              jobId: previous.jobId ?? progress.jobId,
              progress,
            }
          : previous,
      );
    });

    register<ScanComplete>("library-scan-complete", (complete) => {
      if (!acceptingEvents.current) {
        return;
      }
      if (activeJob.current && complete.jobId !== activeJob.current) {
        return;
      }
      activeJob.current = null;
      setState({
        status: "review",
        rootPath: complete.rootPath,
        candidates: complete.candidates,
        cancelled: complete.cancelled,
        stats: complete,
      });
    });

    register<ScanErrorEvent>("library-scan-error", (error) => {
      if (!acceptingEvents.current) {
        return;
      }
      if (activeJob.current && error.jobId !== activeJob.current) {
        return;
      }
      activeJob.current = null;
      setState({
        status: "error",
        rootPath: error.rootPath,
        message: error.message,
      });
    });

    return () => {
      active = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  const start = useCallback(async (rootPath: string) => {
    const token = ++runToken.current;
    activeJob.current = null;
    acceptingEvents.current = true;
    setState({
      status: "scanning",
      rootPath,
      jobId: null,
      progress: null,
      cancelling: false,
    });

    if (!isTauri()) {
      for (let step = 1; step <= 4; step += 1) {
        await delay(170);
        if (token !== runToken.current) {
          return;
        }
        setState((previous) =>
          previous.status === "scanning"
            ? {
                ...previous,
                progress: {
                  jobId: "preview",
                  rootPath,
                  phase: "walking",
                  scannedDirs: step * 23,
                  foundCandidates: Math.min(8, step * 2),
                  currentPath: rootPath,
                  elapsedMs: step * 170,
                },
              }
            : previous,
        );
      }
      await delay(260);
      if (token !== runToken.current) {
        return;
      }
      const candidates = previewScanCandidates(rootPath);
      setState({
        status: "review",
        rootPath,
        candidates,
        cancelled: false,
        stats: {
          jobId: "preview",
          rootPath,
          candidates,
          cancelled: false,
          scannedDirs: 92,
          skippedDirs: 3,
          truncated: false,
          durationMs: 940,
        },
      });
      return;
    }

    try {
      const result = await startLibraryScan(rootPath);
      if (token !== runToken.current) {
        return;
      }
      activeJob.current = result.jobId;
      setState((previous) =>
        previous.status === "scanning" ? { ...previous, jobId: result.jobId } : previous,
      );
    } catch (error) {
      activeJob.current = null;
      setState({
        status: "error",
        rootPath,
        message: describeError(error),
      });
    }
  }, []);

  const pickAndStart = useCallback(async () => {
    try {
      const rootPath = await pickLibraryRoot();
      if (rootPath) {
        await start(rootPath);
      }
    } catch (error) {
      setState({
        status: "error",
        rootPath: "",
        message: describeError(error),
      });
    }
  }, [start]);

  const cancel = useCallback(async () => {
    if (!isTauri()) {
      runToken.current += 1;
      acceptingEvents.current = false;
      setState((previous) => {
        if (previous.status !== "scanning") {
          return previous;
        }
        return {
          status: "review",
          rootPath: previous.rootPath,
          candidates: previewScanCandidates(previous.rootPath).slice(0, 4),
          cancelled: true,
          stats: null,
        };
      });
      return;
    }

    setState((previous) =>
      previous.status === "scanning" ? { ...previous, cancelling: true } : previous,
    );
    try {
      const active = await cancelLibraryScan();
      if (!active) {
        activeJob.current = null;
        acceptingEvents.current = false;
        setState((previous) => (previous.status === "scanning" ? { status: "idle" } : previous));
      }
    } catch {
      setState((previous) =>
        previous.status === "scanning" ? { ...previous, cancelling: false } : previous,
      );
    }
  }, []);

  const close = useCallback(() => {
    runToken.current += 1;
    acceptingEvents.current = false;
    if (isTauri()) {
      void cancelLibraryScan().catch(() => undefined);
    }
    activeJob.current = null;
    setState({ status: "idle" });
  }, []);

  const importSelected = useCallback(
    async (candidates: ImportCandidateInput[]): Promise<ImportResult> => {
      if (candidates.length === 0) {
        throw new Error("请选择至少一个候选程序");
      }
      setImporting(true);
      try {
        const result = await importLibraryCandidates(candidates);
        invalidate();
        acceptingEvents.current = false;
        setState({ status: "idle" });
        return result;
      } catch (error) {
        const rootPath = state.status === "review" ? state.rootPath : "";
        setState({
          status: "error",
          rootPath,
          message: describeError(error),
        });
        throw error;
      } finally {
        setImporting(false);
      }
    },
    [invalidate, state],
  );

  const retry = useCallback(async () => {
    if (state.status === "error" && state.rootPath) {
      await start(state.rootPath);
    }
  }, [start, state]);

  return {
    state,
    importing,
    start,
    pickAndStart,
    cancel,
    close,
    importSelected,
    retry,
  };
}
