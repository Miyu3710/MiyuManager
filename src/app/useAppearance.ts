import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Density = "comfortable" | "compact";

interface AppearanceState {
  density: Density;
  theme: "midnight";
  reduceMotion: boolean;
  setDensity: (density: Density) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
}

export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      density: "comfortable",
      theme: "midnight",
      reduceMotion: false,
      setDensity: (density) => set({ density }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
    }),
    { name: "miyu-appearance" },
  ),
);
