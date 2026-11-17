import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LibrarySort } from "../../lib/library-types";

export const DEFAULT_LIBRARY_SORT: LibrarySort = "title_asc";
export const DEFAULT_LIBRARY_VIEW: LibraryViewMode = "grid";
export const DEFAULT_LIBRARY_CARD_CONTENT: LibraryCardContent = "detailed";

export type LibraryViewMode = "grid" | "list";
export type LibraryCardContent = "detailed" | "balanced" | "concise" | "textless";

const librarySorts: LibrarySort[] = ["added_desc", "title_asc", "size_desc", "last_played_desc"];

function isLibrarySort(value: unknown): value is LibrarySort {
  return typeof value === "string" && librarySorts.includes(value as LibrarySort);
}

function isLibraryView(value: unknown): value is LibraryViewMode {
  return value === "grid" || value === "list";
}

function isLibraryCardContent(value: unknown): value is LibraryCardContent {
  return (
    value === "detailed" || value === "balanced" || value === "concise" || value === "textless"
  );
}

interface LibraryPreferencesState {
  sort: LibrarySort;
  view: LibraryViewMode;
  cardContent: LibraryCardContent;
  setSort: (sort: LibrarySort) => void;
  setView: (view: LibraryViewMode) => void;
  setCardContent: (cardContent: LibraryCardContent) => void;
}

export const useLibraryPreferences = create<LibraryPreferencesState>()(
  persist(
    (set) => ({
      sort: DEFAULT_LIBRARY_SORT,
      view: DEFAULT_LIBRARY_VIEW,
      cardContent: DEFAULT_LIBRARY_CARD_CONTENT,
      setSort: (sort) => set({ sort }),
      setView: (view) => set({ view }),
      setCardContent: (cardContent) => set({ cardContent }),
    }),
    {
      name: "miyu-library-preferences",
      version: 1,
      partialize: (state) => ({
        sort: state.sort,
        view: state.view,
        cardContent: state.cardContent,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<LibraryPreferencesState>;
        return {
          ...current,
          sort: isLibrarySort(saved.sort) ? saved.sort : current.sort,
          view: isLibraryView(saved.view) ? saved.view : current.view,
          cardContent: isLibraryCardContent(saved.cardContent)
            ? saved.cardContent
            : current.cardContent,
        };
      },
    },
  ),
);
