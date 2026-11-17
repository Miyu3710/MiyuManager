import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Density = "comfortable" | "compact";
export type ContentWidth = "standard" | "full";

interface AppearanceState {
  density: Density;
  contentWidth: ContentWidth;
  theme: "sakura";
  reduceMotion: boolean;
  bigScreenHints: boolean;
  railCollapsed: boolean;
  setDensity: (density: Density) => void;
  setContentWidth: (contentWidth: ContentWidth) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
  setBigScreenHints: (bigScreenHints: boolean) => void;
  toggleRail: () => void;
}

export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      density: "comfortable",
      contentWidth: "full",
      theme: "sakura",
      reduceMotion: false,
      bigScreenHints: true,
      railCollapsed: false,
      setDensity: (density) => set({ density }),
      setContentWidth: (contentWidth) => set({ contentWidth }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setBigScreenHints: (bigScreenHints) => set({ bigScreenHints }),
      toggleRail: () => set((state) => ({ railCollapsed: !state.railCollapsed })),
    }),
    {
      name: "miyu-appearance",
      version: 4,
      migrate: (persisted) => {
        const state = persisted as Partial<AppearanceState>;
        return {
          ...state,
          contentWidth: state.contentWidth ?? "full",
          theme: "sakura",
          bigScreenHints: state.bigScreenHints ?? true,
        };
      },
    },
  ),
);
