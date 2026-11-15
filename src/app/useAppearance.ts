import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Density = "comfortable" | "compact";

interface AppearanceState {
  density: Density;
  theme: "sakura";
  reduceMotion: boolean;
  setDensity: (density: Density) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
}

export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      density: "comfortable",
      theme: "sakura",
      reduceMotion: false,
      setDensity: (density) => set({ density }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
    }),
    {
      name: "miyu-appearance",
      version: 2,
      migrate: (persisted) => ({
        ...(persisted as Partial<AppearanceState>),
        theme: "sakura",
      }),
    },
  ),
);
