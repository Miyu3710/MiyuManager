import { useMemo, useState } from "react";
import type { ImportCandidateInput, ScanCandidate } from "../../lib/library-types";
import type { ScanView } from "./useLibraryScan";

export type ReviewScanState = Extract<ScanView, { status: "review" }>;

const EMPTY_CANDIDATES: ScanCandidate[] = [];

interface CandidateGroup {
  key: string;
  workingDir: string;
  rootPath: string;
  candidates: ScanCandidate[];
  defaultIndex: number;
  alreadyImported: boolean;
}

interface SelectionState {
  key: string;
  selected: Record<string, boolean>;
  names: Record<string, string>;
  chosen: Record<string, number>;
}

function groupCandidates(candidates: ScanCandidate[]): CandidateGroup[] {
  const grouped = new Map<string, ScanCandidate[]>();
  for (const candidate of candidates) {
    const key = candidate.workingDir.toLocaleLowerCase();
    const group = grouped.get(key);
    if (group) {
      group.push(candidate);
    } else {
      grouped.set(key, [candidate]);
    }
  }

  return [...grouped.entries()]
    .map(([key, groupCandidates]) => {
      const ordered = [...groupCandidates].sort(
        (a, b) => Number(a.alreadyImported) - Number(b.alreadyImported),
      );
      const firstImportable = ordered.findIndex((candidate) => !candidate.alreadyImported);
      return {
        key,
        workingDir: ordered[0]?.workingDir ?? "",
        rootPath: ordered[0]?.rootPath ?? "",
        candidates: ordered,
        defaultIndex: Math.max(0, firstImportable),
        alreadyImported: ordered.every((candidate) => candidate.alreadyImported),
      };
    })
    .sort((a, b) => Number(a.alreadyImported) - Number(b.alreadyImported));
}

function buildSelection(groups: CandidateGroup[], selectAll: boolean): SelectionState {
  const selected: Record<string, boolean> = {};
  const names: Record<string, string> = {};
  const chosen: Record<string, number> = {};
  for (const group of groups) {
    const candidate = group.candidates[group.defaultIndex] ?? group.candidates[0];
    selected[group.key] = selectAll && !group.alreadyImported;
    names[group.key] = candidate?.suggestedTitle ?? "";
    chosen[group.key] = group.defaultIndex;
  }
  return {
    key: groups.map((group) => group.key).join("|"),
    selected,
    names,
    chosen,
  };
}

export interface ScanSelection {
  groups: CandidateGroup[];
  selected: Record<string, boolean>;
  names: Record<string, string>;
  chosen: Record<string, number>;
  selectedGroups: CandidateGroup[];
  canImport: boolean;
  toggleAll: () => void;
  clearSelection: () => void;
  reset: () => void;
  toggleGroup: (group: CandidateGroup, checked: boolean) => void;
  setGroupName: (group: CandidateGroup, name: string) => void;
  chooseExecutable: (group: CandidateGroup, nextIndex: number) => void;
  buildCandidates: () => ImportCandidateInput[];
}

export function useScanSelection(
  candidates: ScanCandidate[] = EMPTY_CANDIDATES,
  defaultSelected: "all" | "none" = "none",
): ScanSelection {
  const selectAll = defaultSelected === "all";
  const groups = useMemo(() => groupCandidates(candidates), [candidates]);
  const groupKey = useMemo(() => groups.map((group) => group.key).join("|"), [groups]);
  const defaults = useMemo(() => buildSelection(groups, selectAll), [groups, selectAll]);
  const [selectionState, setSelectionState] = useState<SelectionState>(() =>
    buildSelection([], selectAll),
  );
  const activeSelection = selectionState.key === groupKey ? selectionState : defaults;
  const selectedGroups = groups.filter(
    (group) => activeSelection.selected[group.key] && !group.alreadyImported,
  );
  const canImport =
    selectedGroups.length > 0 &&
    selectedGroups.every((group) => {
      const candidate = group.candidates[activeSelection.chosen[group.key] ?? group.defaultIndex];
      return Boolean(candidate) && (activeSelection.names[group.key] ?? "").trim().length > 0;
    });

  const toggleAll = () => {
    setSelectionState((previous) => {
      const base = previous.key === groupKey ? previous : defaults;
      const importable = groups.filter((group) => !group.alreadyImported);
      const allSelected = importable.every((group) => base.selected[group.key]);
      const next: Record<string, boolean> = {};
      for (const group of groups) {
        next[group.key] = group.alreadyImported ? false : !allSelected;
      }
      return {
        key: groupKey,
        selected: next,
        names: base.names,
        chosen: base.chosen,
      };
    });
  };

  const clearSelection = () => {
    setSelectionState((previous) => {
      const base = previous.key === groupKey ? previous : defaults;
      return {
        key: groupKey,
        selected: {},
        names: base.names,
        chosen: base.chosen,
      };
    });
  };

  const reset = () => {
    setSelectionState(buildSelection([], selectAll));
  };

  const toggleGroup = (group: CandidateGroup, checked: boolean) => {
    setSelectionState((previous) => {
      const base = previous.key === groupKey ? previous : defaults;
      return {
        key: groupKey,
        selected: {
          ...base.selected,
          [group.key]: checked,
        },
        names: base.names,
        chosen: base.chosen,
      };
    });
  };

  const setGroupName = (group: CandidateGroup, name: string) => {
    setSelectionState((previous) => {
      const base = previous.key === groupKey ? previous : defaults;
      return {
        key: groupKey,
        selected: base.selected,
        names: {
          ...base.names,
          [group.key]: name,
        },
        chosen: base.chosen,
      };
    });
  };

  const chooseExecutable = (group: CandidateGroup, nextIndex: number) => {
    setSelectionState((previous) => {
      const base = previous.key === groupKey ? previous : defaults;
      const previousIndex = base.chosen[group.key] ?? group.defaultIndex;
      const previousCandidate = (group.candidates[previousIndex] ?? group.candidates[0])!;
      const nextCandidate = (group.candidates[nextIndex] ?? group.candidates[0])!;
      const currentName = base.names[group.key] ?? previousCandidate.suggestedTitle;
      const followsSuggestion = currentName.trim() === previousCandidate.suggestedTitle.trim();
      return {
        key: groupKey,
        selected: base.selected,
        names: {
          ...base.names,
          [group.key]: followsSuggestion ? nextCandidate.suggestedTitle : currentName,
        },
        chosen: {
          ...base.chosen,
          [group.key]: nextIndex,
        },
      };
    });
  };

  const buildCandidates = (): ImportCandidateInput[] => {
    const nextCandidates: ImportCandidateInput[] = [];
    for (const group of selectedGroups) {
      const candidate =
        group.candidates[activeSelection.chosen[group.key] ?? group.defaultIndex] ??
        group.candidates[0];
      const displayName = (
        activeSelection.names[group.key] ??
        candidate?.suggestedTitle ??
        ""
      ).trim();
      if (!candidate || !displayName) {
        continue;
      }
      nextCandidates.push({
        exePath: candidate.exePath,
        workingDir: candidate.workingDir,
        displayName,
        rootPath: candidate.rootPath,
        sizeBytes: candidate.sizeBytes,
      });
    }
    return nextCandidates;
  };

  return {
    groups,
    selected: activeSelection.selected,
    names: activeSelection.names,
    chosen: activeSelection.chosen,
    selectedGroups,
    canImport,
    toggleAll,
    clearSelection,
    reset,
    toggleGroup,
    setGroupName,
    chooseExecutable,
    buildCandidates,
  };
}
