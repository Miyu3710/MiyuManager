export type ProxyMode = "system" | "direct" | "custom";

export interface WrapperConfig {
  id: string;
  path: string;
  args: string[];
}

export interface AppPreferences {
  proxyMode: ProxyMode;
  proxyUrl: string;
  defaultMonitor: number | null;
  launchFullscreen: boolean;
  wrappers: WrapperConfig[];
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

export interface BackupInfo {
  name: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
}

export interface DatabaseHealth {
  dbPath: string;
  backupDir: string;
  logDir: string;
  sizeBytes: number;
  integrity: string;
  appliedMigrations: number;
  pendingMigrations: number[];
  backupCount: number;
  latestBackup: BackupInfo | null;
}

export interface RestoreOutcome {
  safetyBackup: BackupInfo;
  restarting: boolean;
}
