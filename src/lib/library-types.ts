export type LibraryStatus = "unclassified" | "playing" | "queued" | "finished" | "paused";
export type LibraryFilter = "all" | LibraryStatus;
export type LibrarySort = "added_desc" | "title_asc" | "size_desc" | "last_played_desc";

export interface LibraryItem {
  /** Only used by the browser preview, where routes keep the hand-written mock ids. */
  id?: string;
  localCopyId: number;
  workId: number;
  title: string;
  originalTitle: string;
  developer: string | null;
  publisher: string | null;
  year: number | null;
  edition: string | null;
  status: LibraryStatus;
  rating: number | null;
  favorite: boolean;
  tags: string[];
  description: string;
  sizeBytes: number;
  fileSizeBytes: number;
  exePath: string;
  workingDir: string;
  rootPath: string;
  displayName: string;
  installStatus: "installed" | "missing";
  addedAt: string;
  lastPlayedAt: string | null;
  playtimeMinutes: number;
  launchCount: number;
  catalogNo: string;
  coverThumbPath: string | null;
  coverPath: string | null;
}

export interface LibraryItemDetail extends LibraryItem {
  notes: string;
  releaseDate: string | null;
  language: string | null;
  platform: string;
  aliases: string[];
  coverSource: string | null;
  coverUpdatedAt: string | null;
  launchProfile: LaunchProfile | null;
}

export interface EnvVar {
  key: string;
  value: string;
}

export interface LaunchProfile {
  args: string[];
  env: EnvVar[];
  wrapperPath: string | null;
  wrapperArgs: string[];
  monitor: number | null;
  fullscreen: boolean;
}

export interface LaunchConfigInput {
  exePath: string;
  workingDir: string;
  profile: LaunchProfile;
}

export interface WorkUpdateInput {
  title: string;
  originalTitle: string;
  aliases: string[];
  description: string;
  year: number | null;
  developer: string | null;
  publisher: string | null;
  edition: string | null;
  language: string | null;
  releaseDate: string | null;
  tags: string[];
  notes: string;
  rating: number | null;
  status: LibraryStatus;
  favorite: boolean;
}

export interface PathCheck {
  path: string;
  ok: boolean;
  message: string;
}

export interface ValidationReport {
  exe: PathCheck;
  workingDir: PathCheck;
  wrapper: PathCheck | null;
  valid: boolean;
}

export interface CoverCandidate {
  path: string;
  fileName: string;
  width: number;
  height: number;
}

export interface CoverAsset {
  workId: number;
  originalPath: string;
  thumbPath: string;
  width: number;
  height: number;
  source: string;
}

export interface MonitorInfo {
  index: number;
  name: string;
  width: number;
  height: number;
  scaleFactor: number;
}

export interface LaunchSnapshot {
  launchId: string;
  workId: number;
  pid: number;
  state: "running" | "exited";
  startedAt: string;
  jobTracked: boolean;
  exitCode: number | null;
  message: string | null;
}

export interface LibraryCounts {
  all: number;
  unclassified: number;
  playing: number;
  queued: number;
  finished: number;
  paused: number;
}

export interface LibraryPage {
  items: LibraryItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: LibraryCounts;
}

export interface LibraryQuery {
  search: string;
  status: LibraryFilter;
  sort: LibrarySort;
  page: number;
  pageSize: number;
}

export interface ScanRoot {
  id: number;
  path: string;
  enabled: boolean;
  lastScannedAt: string | null;
  createdAt: string;
}

export interface ScanCandidate {
  id: string;
  exeKey: string;
  exePath: string;
  workingDir: string;
  rootPath: string;
  suggestedTitle: string;
  fileSizeBytes: number;
  sizeBytes: number;
  sizeIsEstimate: boolean;
  confidence: "high" | "medium" | "low";
  reason: string;
  alreadyImported: boolean;
}

export interface ScanStart {
  jobId: string;
  rootPath: string;
  rootId: number;
}

export interface ScanProgress {
  jobId: string;
  rootPath: string;
  phase: string;
  scannedDirs: number;
  foundCandidates: number;
  currentPath: string;
  elapsedMs: number;
}

export interface ScanComplete {
  jobId: string;
  rootPath: string;
  candidates: ScanCandidate[];
  cancelled: boolean;
  scannedDirs: number;
  skippedDirs: number;
  truncated: boolean;
  durationMs: number;
}

export interface ScanErrorEvent {
  jobId: string;
  rootPath: string;
  message: string;
}

export interface AppInfo {
  dataDir: string;
  dbPath: string;
  libraryCount: number;
  exclusionCount: number;
  version: string;
}

export interface ScanExclusion {
  id: number;
  exeKey: string;
  exePath: string;
  dirKey: string;
  workingDir: string;
  rootPath: string;
  reason: string;
  createdAt: string;
}

export interface ImportCandidateInput {
  exePath: string;
  workingDir: string;
  displayName: string;
  rootPath: string;
  sizeBytes: number;
}

export interface ImportResult {
  imported: number;
  updated: number;
}
