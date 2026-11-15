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
  playtimeSeconds?: number;
  launchCount: number;
  catalogNo: string;
  coverThumbPath: string | null;
  coverPath: string | null;
  steamAppId?: number | null;
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

export type PlaySessionStatus = "running" | "paused" | "ended";
export type PlaySessionSource = "launcher" | "manual";

export interface PlaySessionRecord {
  id: number;
  workId: number;
  localCopyId: number;
  launchId: string | null;
  status: PlaySessionStatus;
  startedAt: string;
  lastHeartbeatAt: string;
  endedAt: string | null;
  durationSec: number;
  endReason: string | null;
  source: PlaySessionSource;
  processId: number | null;
  exePath: string | null;
  note: string;
  corrected: boolean;
}

export interface PlaySessionWithWork extends PlaySessionRecord {
  workTitle: string;
  originalTitle: string;
}

export interface SessionCreateInput {
  workId: number;
  startedAt: string;
  endedAt: string;
  note: string;
}

export interface SessionUpdateInput {
  startedAt: string;
  endedAt: string;
  note: string;
}

export type StatsPeriod = "week" | "month" | "year" | "all";

export interface DailyPlaytime {
  date: string;
  seconds: number;
}

export interface TopGame {
  workId: number;
  title: string;
  originalTitle: string;
  seconds: number;
  sessionCount: number;
}

export interface StatsOverview {
  allTimeSeconds: number;
  allTimeSessions: number;
  last7Seconds: number;
  last30Seconds: number;
  currentWeekLaunches: number;
  currentWeekGames: number;
  previous7Seconds: number;
  range: StatsPeriod;
  rangeSeconds: number;
  rangeLaunches: number;
  daily: DailyPlaytime[];
  topGames: TopGame[];
  recentSessions: PlaySessionWithWork[];
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
  steamAppId?: number | null;
}

export interface ImportResult {
  imported: number;
  updated: number;
}

export interface SteamLibraryInfo {
  path: string;
  appCount: number;
}

export interface SteamGameScan {
  appId: number;
  name: string;
  installDir: string;
  sizeOnDisk: number;
  lastUpdated: number | null;
  candidates: ScanCandidate[];
  alreadyImported: boolean;
  error: string | null;
}

export interface SteamScanProgress {
  jobId: string;
  phase: string;
  currentLibrary: string;
  currentGame: string;
  completed: number;
  total: number;
  foundCandidates: number;
  scannedDirs: number;
  elapsedMs: number;
}

export interface SteamScanReport {
  steamRoot: string;
  libraries: SteamLibraryInfo[];
  games: SteamGameScan[];
  errors: string[];
  cancelled: boolean;
  scannedDirs: number;
  durationMs: number;
}

export interface SteamScanStart {
  jobId: string;
}

export type MetadataValue = string | number | string[] | null;

export interface MetadataProvider {
  id: string;
  name: string;
  description: string;
  fields: string[];
  priority: number;
  enabled: boolean;
  requiresAuth: boolean;
  authKind: string;
  connected: boolean;
  accountName: string | null;
}

export interface MetadataClaim {
  id: number;
  field: string;
  source: string;
  sourceId: string;
  value: MetadataValue;
  confidence: number | null;
  locked: boolean;
  fetchedAt: string;
  providerName: string;
  priority: number;
}

export interface MetadataFieldState {
  field: string;
  label: string;
  current: MetadataValue;
  source: string | null;
  sourceId: string | null;
  locked: boolean;
  lockSource: string | null;
  conflict: boolean;
  preferredClaimId: number | null;
  currentClaimId: number | null;
  claims: MetadataClaim[];
}

export interface MetadataWorkState {
  workId: number;
  providers: MetadataProvider[];
  fields: MetadataFieldState[];
}

export interface MetadataSearchCandidate {
  provider: string;
  sourceId: string;
  title: string;
  originalTitle: string;
  year: number | null;
  developer: string | null;
  coverUrl: string | null;
  summary: string;
  score: number | null;
  priority: number;
}

export interface MetadataProviderFailure {
  provider: string;
  providerName: string;
  message: string;
}

export interface MetadataJobStart {
  jobId: string;
}

export interface MetadataSearchProgress {
  jobId: string;
  workId: number;
  provider: string;
  providerName: string;
  completed: number;
  total: number;
  message: string;
}

export interface MetadataSearchComplete {
  jobId: string;
  workId: number;
  query: string;
  results: MetadataSearchCandidate[];
  errors: MetadataProviderFailure[];
  cancelled: boolean;
}

export interface MetadataSearchError {
  jobId: string;
  workId: number;
  message: string;
}

export interface ClaimPreview {
  source: string;
  sourceId: string;
  value: MetadataValue;
  priority: number;
  locked: boolean;
}

export interface PreviewField {
  field: string;
  label: string;
  current: MetadataValue;
  candidate: MetadataValue;
  source: string;
  sourceId: string;
  locked: boolean;
  lockSource: string | null;
  defaultSelected: boolean;
  priority: number;
  existing: ClaimPreview[];
}

export interface PreviewCover {
  currentSource: string | null;
  candidateUrl: string;
  kind: string;
  defaultSelected: boolean;
  locked: boolean;
}

export interface MetadataCoverOption {
  url: string;
  kind: string;
  width: number | null;
  height: number | null;
}

export interface MetadataPreview {
  workId: number;
  provider: string;
  providerName: string;
  sourceId: string;
  candidate: {
    provider: string;
    sourceId: string;
    title: string;
    originalTitle: string;
    aliases: string[];
    description: string;
    releaseDate: string | null;
    year: number | null;
    developer: string | null;
    publisher: string | null;
    tags: string[];
    coverUrl: string | null;
    covers?: MetadataCoverOption[];
    related: { sourceId: string; relation: string; title: string }[];
  };
  fields: PreviewField[];
  cover: PreviewCover | null;
  coverOptions?: PreviewCover[];
}

export interface MetadataImportRequest {
  workId: number;
  provider: string;
  sourceId: string;
  selectedFields: string[];
  selectedCover: boolean;
  coverUrl?: string | null;
}

export interface MetadataImportResult {
  applied: string[];
  skippedLocked: string[];
  coverApplied: boolean;
}

export interface FieldPriorityProvider {
  provider: string;
  providerName: string;
  priority: number;
  enabled: boolean;
}

export interface FieldPriorityState {
  field: string;
  label: string;
  providers: FieldPriorityProvider[];
  custom: boolean;
  global: boolean;
}

export interface MergeMatch {
  provider: string;
  providerName: string;
  sourceId: string;
  title: string;
  originalTitle: string;
  year: number | null;
  score: number;
  priority: number;
}

export interface MergeFieldCandidate {
  provider: string;
  providerName: string;
  sourceId: string;
  value: MetadataValue;
  priority: number;
}

export interface MergeFieldState {
  field: string;
  label: string;
  current: MetadataValue;
  locked: boolean;
  lockSource: string | null;
  candidates: MergeFieldCandidate[];
  defaultSelected: boolean;
  conflict: boolean;
}

export interface MergeCoverCandidate {
  provider: string;
  providerName: string;
  sourceId: string;
  url: string;
  kind: string;
  priority: number;
  defaultSelected: boolean;
}

export interface MergePreview {
  workId: number;
  title: string;
  query: string;
  matched: MergeMatch[];
  errors: MetadataProviderFailure[];
  fields: MergeFieldState[];
  covers: MergeCoverCandidate[];
}

export interface MergeSelection {
  field: string;
  provider: string;
  sourceId: string;
  url?: string | null;
}

export interface MergeApplyRequest {
  workId: number;
  selections: MergeSelection[];
  cover: MergeSelection | null;
  onlyIfEmpty?: boolean;
}

export interface MergeApplyResult {
  applied: string[];
  skippedLocked: string[];
  skippedNonEmpty: string[];
  coverApplied: boolean;
  errors: string[];
}

export interface BatchStartRequest {
  workIds: number[];
  providerIds: string[];
  includeCovers: boolean;
}

export interface BatchProgress {
  jobId: string;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  paused: boolean;
  cancelled: boolean;
  currentWorkId: number | null;
  currentTitle: string;
  message: string;
}

export interface BatchWorkResult {
  jobId: string;
  workId: number;
  title: string;
  status: "proposed" | "skipped" | "failed" | string;
  preview: MergePreview | null;
  error: string | null;
}

export interface BatchComplete {
  jobId: string;
  total: number;
  completed: number;
  failed: number;
  cancelled: boolean;
  message: string;
}

export interface BatchApplyRequest {
  jobId: string;
  workIds: number[];
  includeCovers: boolean;
}

export interface BatchApplyWorkResult {
  workId: number;
  title: string;
  status: "applied" | "skipped" | "failed" | string;
  applied: string[];
  skippedLocked: string[];
  skippedNonEmpty: string[];
  coverApplied: boolean;
  errors: string[];
}

export interface BatchApplyResult {
  total: number;
  appliedWorks: number;
  failedWorks: number;
  skippedWorks: number;
  appliedFields: number;
  coverApplied: number;
  works: BatchApplyWorkResult[];
}

export interface OAuthStatus {
  id: string;
  name: string;
  description: string;
  authKind: "oauth2" | "oauth2_pkce" | string;
  configured: boolean;
  connected: boolean;
  accountName: string | null;
  accountId: string | null;
  scopes: string[];
  expiresAt: number | null;
  hint: string | null;
}

export interface OAuthConfigInfo {
  path: string | null;
  error: string | null;
  checkedPaths: string[];
  dataDir: string;
  providerIds: string[];
}
