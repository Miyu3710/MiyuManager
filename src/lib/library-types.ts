export type LibraryStatus = "unclassified" | "playing" | "queued" | "finished" | "paused";
export type LibraryFilter = "all" | LibraryStatus;
export type LibrarySort = "added_desc" | "title_asc" | "size_desc" | "last_played_desc";

export interface LibraryItem {
  /** Only used by the browser preview, where routes keep the hand-written mock ids. */
  id?: string;
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
}

export interface LibraryItemDetail extends LibraryItem {
  notes: string;
  releaseDate: string | null;
  language: string | null;
  platform: string;
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
