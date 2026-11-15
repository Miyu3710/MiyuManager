export type ProxyMode = "system" | "direct" | "custom";

export interface AppPreferences {
  proxyMode: ProxyMode;
  proxyUrl: string;
  defaultMonitor: number | null;
  launchFullscreen: boolean;
  wrapperPath: string;
  wrapperArgs: string[];
  updateManifestUrl: string;
  onboardingCompleted: boolean;
}

export interface UpdateCheck {
  currentVersion: string;
  configured: boolean;
  latestVersion: string | null;
  updateAvailable: boolean;
  notes: string | null;
  url: string | null;
  message: string;
}
