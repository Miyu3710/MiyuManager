import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Game } from "./game-data";
import { games as mockGames } from "./game-data";
import type {
  AppInfo,
  ImportCandidateInput,
  ImportResult,
  LibraryCounts,
  LibraryItem,
  LibraryItemDetail,
  LibraryPage,
  LibraryQuery,
  LibraryStatus,
  LaunchConfigInput,
  LaunchProfile,
  LaunchSnapshot,
  MonitorInfo,
  ScanCandidate,
  ScanExclusion,
  ScanRoot,
  ScanStart,
  CoverAsset,
  CoverCandidate,
  ValidationReport,
  WorkUpdateInput,
  MetadataProvider,
  MetadataJobStart,
  MetadataPreview,
  MetadataImportRequest,
  MetadataImportResult,
  MetadataWorkState,
  MetadataSearchCandidate,
  MetadataSearchComplete,
  MetadataClaim,
  MetadataValue,
  MetadataFieldState,
  OAuthConfigInfo,
  OAuthStatus,
  FieldPriorityState,
  FieldPriorityProvider,
  MergePreview,
  MergeFieldState,
  MergeFieldCandidate,
  MergeCoverCandidate,
  MergeApplyRequest,
  MergeApplyResult,
  MergeSelection,
  BatchStartRequest,
  BatchWorkResult,
  BatchApplyRequest,
  BatchApplyResult,
  BatchApplyWorkResult,
  SteamScanReport,
  SteamScanStart,
  SteamGameScan,
  DailyPlaytime,
  PlaySessionWithWork,
  SessionCreateInput,
  SessionUpdateInput,
  StatsOverview,
  StatsPeriod,
  TopGame,
} from "./library-types";
import { formatBytes, formatPlaytimeSeconds, formatRelativeDate } from "./format";

type PreviewLibraryItem = LibraryItem & { previewGame?: Game };

const previewImported: PreviewLibraryItem[] = [];
const previewRemoved = new Set<number>();
const previewExclusions: ScanExclusion[] = [];
const previewStatus = new Map<number, LibraryStatus>();
const previewFavorite = new Map<number, boolean>();
const previewWorkUpdates = new Map<number, WorkUpdateInput>();
const previewLaunchProfiles = new Map<number, LaunchProfile>();
const previewPlaySessions: PlaySessionWithWork[] = createPreviewPlaySessions();
let previewSessionId = 10_000;
const previewRoots: ScanRoot[] = [
  {
    id: 1,
    path: "D:\\Games\\Preview",
    enabled: true,
    lastScannedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
];
let previewWorkId = 1000;

function createPreviewPlaySessions(): PlaySessionWithWork[] {
  const now = Date.now();
  return mockGames.flatMap((game, gameIndex) =>
    game.sessions.map((session, sessionIndex) => {
      const endedAt = new Date(
        now - (gameIndex * 2 + sessionIndex + 1) * 86_400_000 - 3_600_000,
      ).toISOString();
      const startedAt = new Date(
        new Date(endedAt).getTime() - session.minutes * 60_000,
      ).toISOString();
      const endReason =
        session.ended === "手动结束"
          ? "manual_stop"
          : session.ended === "异常中断"
            ? "recovered"
            : "exited";
      return {
        id: gameIndex * 100 + sessionIndex + 1,
        workId: gameIndex + 1,
        localCopyId: gameIndex + 1,
        launchId: null,
        status: "ended",
        startedAt,
        lastHeartbeatAt: endedAt,
        endedAt,
        durationSec: session.minutes * 60,
        endReason,
        source: "launcher",
        processId: null,
        exePath: game.exePath,
        note: "",
        corrected: false,
        workTitle: game.title,
        originalTitle: game.originalTitle,
      } satisfies PlaySessionWithWork;
    }),
  );
}

const emptyCounts = (): LibraryCounts => ({
  all: 0,
  unclassified: 0,
  playing: 0,
  queued: 0,
  finished: 0,
  paused: 0,
});

function mockToItem(game: Game, index: number): PreviewLibraryItem {
  const workId = index + 1;
  return {
    id: game.id,
    localCopyId: workId,
    workId,
    title: game.title,
    originalTitle: game.originalTitle,
    developer: game.developer,
    publisher: game.developer,
    year: game.year,
    edition: game.edition,
    status: previewStatus.get(workId) ?? game.status,
    rating: game.rating,
    favorite: previewFavorite.get(workId) ?? false,
    tags: game.tags,
    description: game.description,
    sizeBytes: 0,
    fileSizeBytes: 0,
    exePath: game.exePath,
    workingDir: game.installedPath,
    rootPath: "D:\\Games\\Preview",
    displayName: game.title,
    installStatus: "installed",
    addedAt: new Date(Date.now() - (index + 1) * 86_400_000).toISOString(),
    lastPlayedAt: null,
    playtimeMinutes: game.playtimeMinutes,
    launchCount: game.launchCount,
    catalogNo: game.catalogNo,
    coverThumbPath: null,
    coverPath: null,
    previewGame: game,
  };
}

function previewItems(): PreviewLibraryItem[] {
  const base = mockGames.map(mockToItem);
  return [...base, ...previewImported]
    .filter((item) => !previewRemoved.has(item.workId))
    .map((item) => {
      const update = previewWorkUpdates.get(item.workId);
      if (!update) {
        return item;
      }
      return {
        ...item,
        title: update.title,
        originalTitle: update.originalTitle,
        developer: update.developer,
        publisher: update.publisher,
        year: update.year,
        edition: update.edition,
        status: update.status,
        rating: update.rating,
        favorite: update.favorite,
        tags: update.tags,
        description: update.description,
      };
    });
}

function countStatuses(items: LibraryItem[]): LibraryCounts {
  const counts = emptyCounts();
  for (const item of items) {
    counts.all += 1;
    counts[item.status] += 1;
  }
  return counts;
}

function previewQuery(query: LibraryQuery): LibraryPage {
  const search = query.search.trim().toLocaleLowerCase();
  const items = previewItems().filter((item) => {
    if (!search) {
      return true;
    }
    const haystack = [
      item.title,
      item.originalTitle,
      item.developer ?? "",
      item.publisher ?? "",
      item.exePath,
      item.workingDir,
    ]
      .join(" ")
      .toLocaleLowerCase();
    return haystack.includes(search);
  });
  const counts = countStatuses(items);
  const filtered =
    query.status === "all" ? items : items.filter((item) => item.status === query.status);
  const sorted = [...filtered].sort((left, right) => {
    switch (query.sort) {
      case "title_asc":
        return left.title.localeCompare(right.title, "zh-CN");
      case "size_desc":
        return right.sizeBytes - left.sizeBytes;
      case "last_played_desc":
      case "added_desc":
      default:
        return right.addedAt.localeCompare(left.addedAt);
    }
  });
  const start = query.page * query.pageSize;
  return {
    items: sorted.slice(start, start + query.pageSize),
    total: filtered.length,
    page: query.page,
    pageSize: query.pageSize,
    counts,
  };
}

export function libraryItemId(item: LibraryItem): string {
  return item.id ?? String(item.workId);
}

export function assetUrl(path: string | null | undefined): string | null {
  if (!path || !isTauri()) {
    return null;
  }
  return "http://miyu-asset.localhost/" + path.replace(/^\/+/, "");
}

export async function queryLibrary(query: LibraryQuery): Promise<LibraryPage> {
  if (!isTauri()) {
    return previewQuery(query);
  }
  return invoke<LibraryPage>("library_query", { query });
}

export async function getLibraryItem(id: string | undefined): Promise<LibraryItemDetail | null> {
  if (!id) {
    return null;
  }
  if (!isTauri()) {
    const item = previewItems().find(
      (candidate) => libraryItemId(candidate) === id || String(candidate.workId) === id,
    );
    if (!item) {
      return null;
    }
    const update = previewWorkUpdates.get(item.workId);
    return {
      ...item,
      notes: update?.notes ?? item.previewGame?.notes ?? "",
      releaseDate: update?.releaseDate ?? null,
      language: update?.language ?? null,
      platform: "Windows",
      aliases: update?.aliases ?? [],
      coverSource: null,
      coverUpdatedAt: null,
      launchProfile: previewLaunchProfiles.get(item.workId) ?? null,
    };
  }

  const workId = Number(id);
  if (!Number.isInteger(workId)) {
    return null;
  }
  return invoke<LibraryItemDetail | null>("library_get", { workId });
}

export async function listLibraryRoots(): Promise<ScanRoot[]> {
  if (!isTauri()) {
    return [...previewRoots];
  }
  return invoke<ScanRoot[]>("library_roots");
}

export async function removeLibraryRoot(rootId: number): Promise<void> {
  if (!isTauri()) {
    const index = previewRoots.findIndex((root) => root.id === rootId);
    if (index >= 0) {
      previewRoots.splice(index, 1);
    }
    return;
  }
  await invoke("library_remove_root", { rootId });
}

export async function setLibraryStatus(workId: number, status: LibraryStatus): Promise<void> {
  if (!isTauri()) {
    previewStatus.set(workId, status);
    return;
  }
  await invoke("library_set_status", { workId, status });
}

export async function setLibraryFavorite(workId: number, favorite: boolean): Promise<void> {
  if (!isTauri()) {
    previewFavorite.set(workId, favorite);
    return;
  }
  await invoke("library_set_favorite", { workId, favorite });
}

export async function removeLibraryWork(workId: number): Promise<void> {
  if (!isTauri()) {
    const item = previewItems().find((candidate) => candidate.workId === workId);
    if (item && !previewExclusions.some((entry) => entry.exeKey === item.exePath.toLowerCase())) {
      previewExclusions.push({
        id: previewExclusions.length + 1,
        exeKey: item.exePath.toLowerCase(),
        exePath: item.exePath,
        dirKey: item.workingDir.toLowerCase(),
        workingDir: item.workingDir,
        rootPath: item.rootPath,
        reason: "removed_from_library",
        createdAt: new Date().toISOString(),
      });
    }
    previewRemoved.add(workId);
    return;
  }
  await invoke("library_remove_work", { workId });
}

export async function pickLibraryRoot(manualImport = false): Promise<string | null> {
  if (!isTauri()) {
    return previewRoots[0]?.path ?? "D:\\Games\\Preview";
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false,
    title: manualImport ? "选择要手动导入的游戏目录" : "选择 Galgame / AVG 所在目录",
  });
  if (typeof selected === "string") {
    return selected;
  }
  if (Array.isArray(selected)) {
    return selected[0] ?? null;
  }
  return null;
}

export async function startLibraryScan(
  rootPath: string,
  includeExcluded = false,
): Promise<ScanStart> {
  if (!isTauri()) {
    if (!previewRoots.some((root) => root.path === rootPath)) {
      previewRoots.push({
        id: previewRoots.length + 1,
        path: rootPath,
        enabled: true,
        lastScannedAt: null,
        createdAt: new Date().toISOString(),
      });
    }
    return {
      jobId: "preview-" + Date.now(),
      rootPath,
      rootId: previewRoots.find((root) => root.path === rootPath)?.id ?? 1,
    };
  }
  return invoke<ScanStart>("library_scan_start", { rootPath, includeExcluded });
}

export async function cancelLibraryScan(): Promise<boolean> {
  if (!isTauri()) {
    return true;
  }
  return invoke<boolean>("library_scan_cancel");
}

export async function startSteamScan(): Promise<SteamScanStart> {
  if (!isTauri()) {
    return { jobId: "preview-steam" };
  }
  return invoke<SteamScanStart>("steam_scan_start");
}

export async function cancelSteamScan(): Promise<boolean> {
  if (!isTauri()) {
    return true;
  }
  return invoke<boolean>("library_scan_cancel");
}

export async function listScanExclusions(): Promise<ScanExclusion[]> {
  if (!isTauri()) {
    return [...previewExclusions];
  }
  return invoke<ScanExclusion[]>("library_scan_exclusions");
}

export async function removeScanExclusion(exeKey: string): Promise<void> {
  if (!isTauri()) {
    const index = previewExclusions.findIndex((entry) => entry.exeKey === exeKey);
    if (index >= 0) {
      previewExclusions.splice(index, 1);
    }
    return;
  }
  await invoke("library_remove_scan_exclusion", { exeKey });
}

export function previewScanCandidates(rootPath: string, includeExcluded = false): ScanCandidate[] {
  const candidates = mockGames.slice(0, 8).map((game, index) => {
    const folder = game.originalTitle || game.title;
    const workingDir = rootPath + "\\" + folder;
    const exePath = workingDir + "\\game.exe";
    const exeKey = exePath.toLocaleLowerCase();
    return {
      id: exeKey,
      exeKey,
      exePath,
      workingDir,
      rootPath,
      suggestedTitle: game.title,
      fileSizeBytes: 1_200_000 + index * 260_000,
      sizeBytes: (index + 2) * 1_900_000_000,
      sizeIsEstimate: false,
      confidence: index < 4 ? "high" : index < 7 ? "medium" : "low",
      reason: "常见主程序名 · 目录含游戏资源",
      alreadyImported: false,
    } satisfies ScanCandidate;
  });
  return candidates.filter(
    (candidate) =>
      includeExcluded ||
      !previewExclusions.some(
        (entry) =>
          entry.exeKey === candidate.exeKey || entry.dirKey === candidate.workingDir.toLowerCase(),
      ),
  );
}

export function previewSteamScanReport(): SteamScanReport {
  const commonRoot = "E:\\SteamLibrary\\steamapps\\common";
  const clannadDir = commonRoot + "\\CLANNAD";
  const moonlitDir = "D:\\SteamLibrary\\steamapps\\common\\Moonlit Atelier";
  const games: SteamGameScan[] = [
    {
      appId: 324160,
      name: "CLANNAD",
      installDir: clannadDir,
      sizeOnDisk: 4_698_349_963,
      lastUpdated: 1_760_000_000,
      candidates: [
        {
          id: (clannadDir + "\\CLANNAD.exe").toLowerCase(),
          exeKey: (clannadDir + "\\CLANNAD.exe").toLowerCase(),
          exePath: clannadDir + "\\CLANNAD.exe",
          workingDir: clannadDir,
          rootPath: commonRoot,
          suggestedTitle: "CLANNAD",
          fileSizeBytes: 12_400_000,
          sizeBytes: 4_698_349_963,
          sizeIsEstimate: false,
          confidence: "high",
          reason: "Steam AppID 324160 · 常见主程序名",
          alreadyImported: false,
        },
      ],
      alreadyImported: false,
      error: null,
    },
    {
      appId: 240001,
      name: "月影工房",
      installDir: moonlitDir,
      sizeOnDisk: 3_240_000_000,
      lastUpdated: 1_760_300_000,
      candidates: [
        {
          id: (moonlitDir + "\\MoonlitAtelier.exe").toLowerCase(),
          exeKey: (moonlitDir + "\\MoonlitAtelier.exe").toLowerCase(),
          exePath: moonlitDir + "\\MoonlitAtelier.exe",
          workingDir: moonlitDir,
          rootPath: "D:\\SteamLibrary\\steamapps\\common",
          suggestedTitle: "月影工房",
          fileSizeBytes: 9_800_000,
          sizeBytes: 3_240_000_000,
          sizeIsEstimate: false,
          confidence: "high",
          reason: "Steam AppID 240001 · 常见主程序名",
          alreadyImported: false,
        },
      ],
      alreadyImported: false,
      error: null,
    },
  ];
  return {
    steamRoot: "D:\\Steam",
    libraries: [
      { path: "D:\\Steam", appCount: 1 },
      { path: "E:\\SteamLibrary", appCount: 1 },
    ],
    games,
    errors: [],
    cancelled: false,
    scannedDirs: 128,
    durationMs: 4200,
  };
}

export async function importLibraryCandidates(
  candidates: ImportCandidateInput[],
): Promise<ImportResult> {
  if (!isTauri()) {
    for (const candidate of candidates) {
      const exeKey = candidate.exePath.toLowerCase();
      const dirKey = candidate.workingDir.toLowerCase();
      for (let index = previewExclusions.length - 1; index >= 0; index -= 1) {
        const entry = previewExclusions[index];
        if (entry && (entry.exeKey === exeKey || entry.dirKey === dirKey)) {
          previewExclusions.splice(index, 1);
        }
      }
      const workId = previewWorkId;
      previewWorkId += 1;
      previewImported.push({
        id: "preview-" + workId,
        localCopyId: workId,
        workId,
        title: candidate.displayName,
        originalTitle: "",
        developer: null,
        publisher: null,
        year: null,
        edition: null,
        status: "unclassified",
        rating: null,
        favorite: false,
        tags: [],
        description: "",
        sizeBytes: candidate.sizeBytes,
        fileSizeBytes: 0,
        exePath: candidate.exePath,
        workingDir: candidate.workingDir,
        rootPath: candidate.rootPath,
        displayName: candidate.displayName,
        installStatus: "installed",
        addedAt: new Date().toISOString(),
        lastPlayedAt: null,
        playtimeMinutes: 0,
        launchCount: 0,
        catalogNo: "LOCAL-" + String(workId).padStart(4, "0"),
        coverThumbPath: null,
        coverPath: null,
        steamAppId: candidate.steamAppId ?? null,
      });
    }
    return { imported: candidates.length, updated: 0 };
  }

  return invoke<ImportResult>("library_import_candidates", { candidates });
}

export async function getAppInfo(): Promise<AppInfo> {
  if (!isTauri()) {
    return {
      dataDir: "浏览器预览",
      dbPath: "未连接 SQLite",
      libraryCount: previewItems().length,
      exclusionCount: previewExclusions.length,
      version: "0.1.0-preview",
    };
  }
  return invoke<AppInfo>("app_info");
}

export async function updateWork(workId: number, input: WorkUpdateInput): Promise<void> {
  if (!isTauri()) {
    const item = previewItems().find((candidate) => candidate.workId === workId);
    if (!item) {
      throw new Error("作品不存在");
    }
    previewWorkUpdates.set(workId, input);
    previewStatus.set(workId, input.status);
    previewFavorite.set(workId, input.favorite);
    return;
  }
  await invoke("work_update", { workId, input });
}

export async function validateWork(workId: number): Promise<ValidationReport> {
  if (!isTauri()) {
    const item = previewItems().find((candidate) => candidate.workId === workId);
    if (!item) {
      throw new Error("作品不存在");
    }
    return {
      exe: { path: item.exePath, ok: true, message: "浏览器预览不检查本地路径" },
      workingDir: { path: item.workingDir, ok: true, message: "浏览器预览不检查本地路径" },
      wrapper: null,
      valid: true,
    };
  }
  return invoke<ValidationReport>("work_validate", { workId });
}

export async function saveLaunchProfile(
  workId: number,
  profile: LaunchProfile,
): Promise<LaunchProfile> {
  if (!isTauri()) {
    previewLaunchProfiles.set(workId, profile);
    return profile;
  }
  return invoke<LaunchProfile>("launch_profile_save", { workId, profile });
}

export async function saveLaunchConfig(
  workId: number,
  input: LaunchConfigInput,
): Promise<LaunchProfile> {
  if (!isTauri()) {
    previewLaunchProfiles.set(workId, input.profile);
    return input.profile;
  }
  return invoke<LaunchProfile>("launch_config_save", { workId, input });
}

export async function validateLaunchConfig(
  workId: number,
  input: LaunchConfigInput,
): Promise<ValidationReport> {
  if (!isTauri()) {
    const item = previewItems().find((candidate) => candidate.workId === workId);
    if (!item) {
      throw new Error("作品不存在");
    }
    return {
      exe: { path: input.exePath, ok: true, message: "浏览器预览不检查本地路径" },
      workingDir: { path: input.workingDir, ok: true, message: "浏览器预览不检查本地路径" },
      wrapper: input.profile.wrapperPath
        ? { path: input.profile.wrapperPath, ok: true, message: "浏览器预览不检查包装器" }
        : null,
      valid: true,
    };
  }
  return invoke<ValidationReport>("launch_config_validate", { workId, input });
}

export async function validateLaunch(
  workId: number,
  profile: LaunchProfile,
): Promise<ValidationReport> {
  if (!isTauri()) {
    const item = previewItems().find((candidate) => candidate.workId === workId);
    if (!item) {
      throw new Error("作品不存在");
    }
    return {
      exe: { path: item.exePath, ok: true, message: "浏览器预览不检查本地路径" },
      workingDir: { path: item.workingDir, ok: true, message: "浏览器预览不检查本地路径" },
      wrapper: profile.wrapperPath
        ? { path: profile.wrapperPath, ok: true, message: "浏览器预览不检查包装器" }
        : null,
      valid: true,
    };
  }
  return invoke<ValidationReport>("launch_validate", { workId, profile });
}

export async function setWorkCover(
  workId: number,
  sourcePath: string,
  local = false,
): Promise<CoverAsset> {
  if (!isTauri()) {
    throw new Error("浏览器预览不写入封面缓存；请在 Tauri 窗口中使用。");
  }
  return invoke<CoverAsset>(local ? "work_apply_local_cover" : "work_set_cover", {
    workId,
    sourcePath,
  });
}

export async function clearWorkCover(workId: number): Promise<void> {
  if (!isTauri()) {
    throw new Error("浏览器预览不写入封面缓存；请在 Tauri 窗口中使用。");
  }
  await invoke("work_clear_cover", { workId });
}

export async function discoverWorkCovers(workId: number): Promise<CoverCandidate[]> {
  if (!isTauri()) {
    return [];
  }
  return invoke<CoverCandidate[]>("work_discover_covers", { workId });
}

export async function startWork(workId: number): Promise<LaunchSnapshot> {
  if (!isTauri()) {
    throw new Error("浏览器预览不启动本地程序；请在 Tauri 窗口中使用。");
  }
  return invoke<LaunchSnapshot>("launch_start", { workId });
}

export async function stopWork(workId: number): Promise<boolean> {
  if (!isTauri()) {
    return false;
  }
  return invoke<boolean>("launch_stop", { workId });
}

export async function getLaunchState(workId: number): Promise<LaunchSnapshot | null> {
  if (!isTauri()) {
    return null;
  }
  return invoke<LaunchSnapshot | null>("launch_state", { workId });
}

export async function listWorkSessions(workId: number): Promise<PlaySessionWithWork[]> {
  if (!isTauri()) {
    return previewPlaySessions
      .filter((session) => session.workId === workId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }
  return invoke<PlaySessionWithWork[]>("sessions_list", { workId });
}

export async function createSession(input: SessionCreateInput): Promise<PlaySessionWithWork> {
  if (!isTauri()) {
    const endedAt = new Date(input.endedAt);
    const startedAt = new Date(input.startedAt);
    if (endedAt <= startedAt) {
      throw new Error("结束时间必须晚于开始时间");
    }
    const item = previewItems().find((candidate) => candidate.workId === input.workId);
    if (!item) {
      throw new Error("作品没有本地安装副本，无法补录会话");
    }
    const session: PlaySessionWithWork = {
      id: previewSessionId++,
      workId: item.workId,
      localCopyId: item.localCopyId,
      launchId: null,
      status: "ended",
      startedAt: startedAt.toISOString(),
      lastHeartbeatAt: endedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationSec: Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
      endReason: "manual",
      source: "manual",
      processId: null,
      exePath: item.exePath,
      note: input.note.trim(),
      corrected: false,
      workTitle: item.title,
      originalTitle: item.originalTitle,
    };
    previewPlaySessions.push(session);
    return session;
  }
  return invoke<PlaySessionWithWork>("session_create", { input });
}

export async function updateSession(
  sessionId: number,
  input: SessionUpdateInput,
): Promise<PlaySessionWithWork> {
  if (!isTauri()) {
    const session = previewPlaySessions.find((candidate) => candidate.id === sessionId);
    if (!session) {
      throw new Error("游玩会话不存在");
    }
    const endedAt = new Date(input.endedAt);
    const startedAt = new Date(input.startedAt);
    if (endedAt <= startedAt) {
      throw new Error("结束时间必须晚于开始时间");
    }
    Object.assign(session, {
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      lastHeartbeatAt: endedAt.toISOString(),
      durationSec: Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
      note: input.note.trim(),
      corrected: true,
    });
    return { ...session };
  }
  return invoke<PlaySessionWithWork>("session_update", { sessionId, input });
}

export async function deleteSession(sessionId: number): Promise<void> {
  if (!isTauri()) {
    const index = previewPlaySessions.findIndex((session) => session.id === sessionId);
    if (index < 0) {
      throw new Error("游玩会话不存在");
    }
    previewPlaySessions.splice(index, 1);
    return;
  }
  await invoke("session_delete", { sessionId });
}

function localDayKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function previewStats(period: StatsPeriod): StatsOverview {
  const now = new Date();
  const rangeStart =
    period === "week"
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
      : period === "month"
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : period === "year"
          ? new Date(now.getFullYear(), 0, 1)
          : null;
  const completed = previewPlaySessions.filter((session) => session.status === "ended");
  const sum = (sessions: PlaySessionWithWork[]) =>
    sessions.reduce((total, session) => total + session.durationSec, 0);
  const currentWeekStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - ((now.getDay() + 6) % 7),
  );
  const previous7Start = new Date(now.getTime() - 14 * 86_400_000);
  const currentWeek = completed.filter(
    (session) => new Date(session.startedAt) >= currentWeekStart,
  );
  const ranged = rangeStart
    ? completed.filter((session) => new Date(session.startedAt) >= rangeStart)
    : completed;

  const dailyMap = new Map<string, number>();
  for (const session of completed) {
    if (new Date(session.startedAt) < new Date(now.getTime() - 84 * 86_400_000)) {
      continue;
    }
    const key = localDayKey(new Date(session.startedAt));
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + session.durationSec);
  }
  const daily: DailyPlaytime[] = Array.from({ length: 84 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 83 + index);
    const key = localDayKey(date);
    return { date: key, seconds: dailyMap.get(key) ?? 0 };
  });

  const grouped = new Map<number, TopGame>();
  for (const session of ranged) {
    const current = grouped.get(session.workId);
    if (current) {
      current.seconds += session.durationSec;
      current.sessionCount += 1;
    } else {
      grouped.set(session.workId, {
        workId: session.workId,
        title: session.workTitle,
        originalTitle: session.originalTitle,
        seconds: session.durationSec,
        sessionCount: 1,
      });
    }
  }
  const topGames = [...grouped.values()]
    .sort((left, right) => right.seconds - left.seconds)
    .slice(0, 5);

  return {
    allTimeSeconds: sum(completed),
    allTimeSessions: completed.length,
    last7Seconds: sum(
      completed.filter(
        (session) => new Date(session.startedAt) >= new Date(now.getTime() - 7 * 86_400_000),
      ),
    ),
    last30Seconds: sum(
      completed.filter(
        (session) => new Date(session.startedAt) >= new Date(now.getTime() - 30 * 86_400_000),
      ),
    ),
    currentWeekLaunches: currentWeek.length,
    currentWeekGames: new Set(currentWeek.map((session) => session.workId)).size,
    previous7Seconds: sum(
      completed.filter((session) => {
        const started = new Date(session.startedAt);
        return started >= previous7Start && started < new Date(now.getTime() - 7 * 86_400_000);
      }),
    ),
    range: period,
    rangeSeconds: sum(ranged),
    rangeLaunches: ranged.length,
    daily,
    topGames,
    recentSessions: [...ranged]
      .sort((left, right) => (right.endedAt ?? "").localeCompare(left.endedAt ?? ""))
      .slice(0, 20),
  };
}

export async function getStats(period: StatsPeriod = "all"): Promise<StatsOverview> {
  if (!isTauri()) {
    return previewStats(period);
  }
  return invoke<StatsOverview>("stats_get", { period });
}

export async function listMonitors(): Promise<MonitorInfo[]> {
  if (!isTauri()) {
    return [{ index: 0, name: "主显示器", width: 1920, height: 1080, scaleFactor: 1 }];
  }
  return invoke<MonitorInfo[]>("monitors_list");
}

export async function pickImageFile(): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: false,
    multiple: false,
    title: "选择作品封面",
    filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function pickExecutable(defaultPath?: string): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: false,
    multiple: false,
    defaultPath,
    title: "选择可执行文件",
    filters: [{ name: "Windows 程序", extensions: ["exe"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function pickDirectory(defaultPath?: string): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false,
    defaultPath,
    title: "选择工作目录",
  });
  return typeof selected === "string" ? selected : null;
}

export function libraryItemToGame(item: LibraryItem): Game {
  const previewGame = (item as PreviewLibraryItem).previewGame;
  if (previewGame) {
    return {
      ...previewGame,
      id: libraryItemId(item),
      workId: item.workId,
      title: item.title,
      originalTitle: item.originalTitle,
      year: item.year,
      developer: item.developer ?? previewGame.developer,
      tags: item.tags,
      status: item.status,
      favorite: item.favorite,
      rating: item.rating ?? previewGame.rating,
      description: item.description || previewGame.description,
      playtime: formatPlaytimeSeconds(item.playtimeSeconds ?? item.playtimeMinutes * 60),
      playtimeMinutes: item.playtimeMinutes,
      lastPlayed: item.lastPlayedAt
        ? formatRelativeDate(item.lastPlayedAt)
        : previewGame.lastPlayed,
      addedAt: formatRelativeDate(item.addedAt),
      launchCount: item.launchCount,
      installedSize: item.sizeBytes > 0 ? formatBytes(item.sizeBytes) : previewGame.installedSize,
      installedPath: item.workingDir,
      exePath: item.exePath,
      coverUrl: assetUrl(item.coverThumbPath),
      notes: (item as LibraryItemDetail).notes ?? previewGame.notes,
    };
  }

  return {
    id: libraryItemId(item),
    workId: item.workId,
    title: item.title,
    originalTitle: item.originalTitle,
    romaji: "",
    year: item.year,
    developer: item.developer ?? "未知会社",
    tags: item.tags,
    status: item.status,
    playtime: formatPlaytimeSeconds(item.playtimeSeconds ?? item.playtimeMinutes * 60),
    playtimeMinutes: item.playtimeMinutes,
    lastPlayed: item.lastPlayedAt ? formatRelativeDate(item.lastPlayedAt) : "尚未启动",
    addedAt: formatRelativeDate(item.addedAt),
    rating: item.rating ?? 0,
    description:
      item.description || "从本地目录扫描入库的作品。可以在详情页补全资料、封面和启动配置。",
    cover: null,
    coverUrl: assetUrl(item.coverThumbPath),
    catalogNo: item.catalogNo,
    source: "本地安装",
    engine: "未识别",
    ageRating: "未标记",
    edition: item.edition ?? "未标记",
    launchCount: item.launchCount,
    lastSession: "—",
    installedSize: formatBytes(item.sizeBytes),
    installedPath: item.workingDir,
    exePath: item.exePath,
    sessions: [],
    isLocal: true,
    favorite: item.favorite,
    notes: (item as LibraryItemDetail).notes,
  };
}

const previewMetadataProviders: MetadataProvider[] = [
  {
    id: "vndb",
    name: "VNDB",
    description: "原题、别名、开发商、标签和关联作品",
    fields: [
      "title",
      "original_title",
      "aliases",
      "description",
      "year",
      "tags",
      "developer",
      "publisher",
      "release_date",
      "cover",
      "related",
    ],
    priority: 10,
    enabled: true,
    requiresAuth: false,
    authKind: "none",
    connected: true,
    accountName: null,
  },
  {
    id: "bangumi",
    name: "Bangumi",
    description: "中文标题、简介、发行日期和中文标签",
    fields: [
      "title",
      "original_title",
      "aliases",
      "description",
      "year",
      "tags",
      "developer",
      "publisher",
      "release_date",
      "cover",
    ],
    priority: 20,
    enabled: true,
    requiresAuth: false,
    authKind: "none",
    connected: true,
    accountName: null,
  },
  {
    id: "nextmoe",
    name: "Kungal / NextMoe",
    description: "六源对齐的标题、简介、厂商、标签和关联作品",
    fields: [
      "title",
      "original_title",
      "aliases",
      "description",
      "year",
      "tags",
      "developer",
      "publisher",
      "release_date",
      "cover",
      "related",
    ],
    priority: 30,
    enabled: true,
    requiresAuth: false,
    authKind: "none",
    connected: true,
    accountName: null,
  },
  {
    id: "hikarinagi",
    name: "Hikarinagi",
    description: "Galgame 标题、简介、开发商、标签和封面（需要授权）",
    fields: [
      "title",
      "original_title",
      "aliases",
      "description",
      "year",
      "tags",
      "developer",
      "publisher",
      "release_date",
      "cover",
    ],
    priority: 40,
    enabled: true,
    requiresAuth: true,
    authKind: "oauth2",
    connected: true,
    accountName: "预览账号",
  },
  {
    id: "steam",
    name: "Steam",
    description: "商店页、发行信息、类型标签和封面",
    fields: [
      "title",
      "original_title",
      "aliases",
      "description",
      "year",
      "tags",
      "developer",
      "publisher",
      "release_date",
      "cover",
    ],
    priority: 50,
    enabled: true,
    requiresAuth: false,
    authKind: "none",
    connected: true,
    accountName: null,
  },
];

const previewMetadataProviderDefaults = previewMetadataProviders.map((provider) => ({
  provider,
  priority: provider.priority,
  enabled: provider.enabled,
}));

const previewMetadataClaims = new Map<number, MetadataClaim[]>();
let previewMetadataClaimId = 1;

export function resetMetadataPreviewState() {
  for (const entry of previewMetadataProviderDefaults) {
    entry.provider.priority = entry.priority;
    entry.provider.enabled = entry.enabled;
  }
  previewMetadataClaims.clear();
  previewWorkUpdates.clear();
  previewCoverSources.clear();
  previewFieldPriorityOverrides.clear();
  previewFieldPriorityGlobal = false;
  previewBatchJobs.clear();
  previewMetadataClaimId = 1;
}

type PreviewMetadataCandidate = MetadataPreview["candidate"];

const previewMetadataCandidates: Record<string, MetadataSearchCandidate[]> = {
  bangumi: [
    {
      provider: "bangumi",
      sourceId: "50756",
      title: "月影之锁 错乱偏执狂",
      originalTitle: "月影の鎖 - 錯乱パラノイア -",
      year: 2013,
      developer: "TAKUYO",
      coverUrl: "https://lain.bgm.tv/pic/cover/l/c2/38/50756_0Akzl.jpg",
      summary: "冬浦めぐみ在红霞市与不同的人相遇，逐渐面对自己与这座城市的关系。",
      score: 7.1,
      priority: 20,
    },
    {
      provider: "bangumi",
      sourceId: "194343",
      title: "月影之幻像",
      originalTitle: "月影のシミュラクル",
      year: 2016,
      developer: "あっぷりけ",
      coverUrl: "https://lain.bgm.tv/pic/cover/l/af/e1/194343_91Jrj.jpg",
      summary: "被蜘蛛丝束缚的蝴蝶，再次展翅的故事。",
      score: 6.7,
      priority: 20,
    },
  ],
  vndb: [
    {
      provider: "vndb",
      sourceId: "v11469",
      title: "月影の鎖 -錯乱パラノイア-",
      originalTitle: "月影の鎖 -錯乱パラノイア-",
      year: 2013,
      developer: "Takuyo Co., Ltd.",
      coverUrl: "https://t.vndb.org/cv/49/101149.jpg",
      summary: "VNDB 中的作品条目。",
      score: null,
      priority: 10,
    },
  ],
  nextmoe: [
    {
      provider: "nextmoe",
      sourceId: "86",
      title: "CLANNAD",
      originalTitle: "クラナド",
      year: 2004,
      developer: "Key",
      coverUrl:
        "https://image.kungal.iloveren.link/70/80/7080e1a974b979fd159793c144909fb154ad9407aadb02a281283cc9184f024d.webp",
      summary: "季节是春天，故事从学园日常开始，逐渐发展为与女主角们的恋爱。",
      score: null,
      priority: 30,
    },
  ],
  hikarinagi: [
    {
      provider: "hikarinagi",
      sourceId: "42",
      title: "CLANNAD",
      originalTitle: "クラナド",
      year: 2004,
      developer: "Key",
      coverUrl:
        "https://image.kungal.iloveren.link/70/80/7080e1a974b979fd159793c144909fb154ad9407aadb02a281283cc9184f024d.webp",
      summary: "",
      score: null,
      priority: 40,
    },
  ],
};

const previewMetadataDetails: Record<string, PreviewMetadataCandidate> = {
  "bangumi:50756": {
    provider: "bangumi",
    sourceId: "50756",
    title: "月影之锁 错乱偏执狂",
    originalTitle: "月影の鎖 - 錯乱パラノイア -",
    aliases: ["Getsuei no Kusari", "月影之锁"],
    description:
      "冬浦めぐみ在红霞市与不同的人相遇，逐渐面对自己与这座城市的关系。她开始理解军驻地计划与自己生活的联系，也在相遇中改变了自己的想法。",
    releaseDate: "2013-04-18",
    year: 2013,
    developer: "TAKUYO",
    publisher: "TAKUYO",
    tags: ["乙女向", "TAKUYO", "乙女游戏", "ADV", "病娇", "暗黑"],
    coverUrl: "https://lain.bgm.tv/pic/cover/l/c2/38/50756_0Akzl.jpg",
    related: [],
  },
  "bangumi:194343": {
    provider: "bangumi",
    sourceId: "194343",
    title: "月影之幻像",
    originalTitle: "月影のシミュラクル",
    aliases: ["Tsukikage no Simulacre"],
    description: "被蜘蛛丝束缚的蝴蝶，再次展翅的故事。",
    releaseDate: "2016-10-01",
    year: 2016,
    developer: "あっぷりけ",
    publisher: "あっぷりけ",
    tags: ["Galgame", "悬疑", "短篇", "ADV"],
    coverUrl: "https://lain.bgm.tv/pic/cover/l/af/e1/194343_91Jrj.jpg",
    related: [],
  },
  "vndb:v11469": {
    provider: "vndb",
    sourceId: "v11469",
    title: "月影の鎖 -錯乱パラノイア-",
    originalTitle: "月影の鎖 -錯乱パラノイア-",
    aliases: ["Getsuei no Kusari -Sakuran Paranoia-", "月影之锁"],
    description: "VNDB 中的作品条目，描述和标签来自 VNDB API。",
    releaseDate: "2013-04-18",
    year: 2013,
    developer: "Takuyo Co., Ltd.",
    publisher: "Takuyo Co., Ltd.",
    tags: ["乙女向", "ADV", "悬疑"],
    coverUrl: "https://t.vndb.org/cv/49/101149.jpg",
    related: [{ sourceId: "v12928", relation: "Sequel", title: "月影の鎖 ―狂爛モラトリアム―" }],
  },
  "nextmoe:86": {
    provider: "nextmoe",
    sourceId: "86",
    title: "CLANNAD",
    originalTitle: "クラナド",
    aliases: ["克兰纳德", "团子大家族", "小镇家族"],
    description:
      "季节是春天，故事从愉快地度过真实贴近生活的学园日常开始，不久剧情将发展为与女主角们的恋爱。",
    releaseDate: "2004-04-28",
    year: 2004,
    developer: "Key",
    publisher: "Limited Run Games / VISUAL ARTS",
    tags: ["恋爱", "家族", "戏剧", "高中", "喜剧", "亲情"],
    coverUrl:
      "https://image.kungal.iloveren.link/70/80/7080e1a974b979fd159793c144909fb154ad9407aadb02a281283cc9184f024d.webp",
    related: [{ sourceId: "215115", relation: "角色出演", title: "ai sp@ce" }],
  },
  "hikarinagi:42": {
    provider: "hikarinagi",
    sourceId: "42",
    title: "CLANNAD",
    originalTitle: "クラナド",
    aliases: ["团子大家族"],
    description: "季节是春天，故事从学园日常开始，逐渐发展为与女主角们的恋爱。",
    releaseDate: "2004-04-28",
    year: 2004,
    developer: "Key",
    publisher: "Visual Arts",
    tags: ["家族", "恋爱", "催泪"],
    coverUrl:
      "https://image.kungal.iloveren.link/70/80/7080e1a974b979fd159793c144909fb154ad9407aadb02a281283cc9184f024d.webp",
    related: [],
  },
};

const previewMergeDetails: Record<string, PreviewMetadataCandidate> = {
  "vndb:v99001": {
    provider: "vndb",
    sourceId: "v99001",
    title: "月影工房",
    originalTitle: "月影のアトリエ",
    aliases: ["Moonlit Atelier", "月光工房"],
    description:
      "边境小镇的旧工房在夜里重新亮灯。年轻的装订师循着月光留下的线索，开始整理一段被遗忘的家族故事。",
    releaseDate: "2022-09-30",
    year: 2022,
    developer: "Kaguya Soft",
    publisher: "Kaguya Soft",
    tags: ["ADV", "剧情", "奇幻", "女性向"],
    coverUrl: "https://t.vndb.org/cv/49/101149.jpg",
    covers: [
      { url: "https://t.vndb.org/cv/49/101149.jpg", kind: "cover", width: 600, height: 900 },
    ],
    related: [],
  },
  "bangumi:99001": {
    provider: "bangumi",
    sourceId: "99001",
    title: "月影工房",
    originalTitle: "月影のアトリエ",
    aliases: ["月光工房", "Moonlit Atelier"],
    description:
      "月光工房是一段关于旧书、夜晚与家族记忆的视觉小说。主角在整理遗物时，发现每一本装订书里都藏着一页未曾寄出的信。",
    releaseDate: "2022-09-30",
    year: 2022,
    developer: "月影制作组",
    publisher: "月影制作组",
    tags: ["视觉小说", "剧情", "治愈", "悬疑"],
    coverUrl: "https://lain.bgm.tv/pic/cover/l/c2/38/50756_0Akzl.jpg",
    covers: [
      {
        url: "https://lain.bgm.tv/pic/cover/l/c2/38/50756_0Akzl.jpg",
        kind: "cover",
        width: 600,
        height: 900,
      },
    ],
    related: [],
  },
  "steam:240001": {
    provider: "steam",
    sourceId: "240001",
    title: "月影工房",
    originalTitle: "Moonlit Atelier",
    aliases: ["Moonlit Atelier"],
    description: "在 Steam 商店页中，月影工房以夜间工房和手写信件为核心，提供中文界面与完整语音。",
    releaseDate: "2022-10-06",
    year: 2022,
    developer: "Kaguya Works",
    publisher: "Miyu Games",
    tags: ["冒险", "休闲", "视觉小说", "单人"],
    coverUrl:
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/324160/library_600x900.jpg",
    covers: [
      {
        url: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/324160/library_600x900.jpg",
        kind: "cover",
        width: 600,
        height: 900,
      },
      {
        url: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/324160/header.jpg",
        kind: "header",
        width: 920,
        height: 430,
      },
    ],
    related: [],
  },
};

const previewMergeCandidates: MetadataSearchCandidate[] = [
  {
    provider: "vndb",
    sourceId: "v99001",
    title: "月影工房",
    originalTitle: "月影のアトリエ",
    year: 2022,
    developer: "Kaguya Soft",
    coverUrl: "https://t.vndb.org/cv/49/101149.jpg",
    summary: "",
    score: null,
    priority: 10,
  },
  {
    provider: "bangumi",
    sourceId: "99001",
    title: "月影工房",
    originalTitle: "月影のアトリエ",
    year: 2022,
    developer: "月影制作组",
    coverUrl: "https://lain.bgm.tv/pic/cover/l/c2/38/50756_0Akzl.jpg",
    summary: "",
    score: 8.1,
    priority: 20,
  },
  {
    provider: "steam",
    sourceId: "240001",
    title: "月影工房",
    originalTitle: "Moonlit Atelier",
    year: 2022,
    developer: "Kaguya Works",
    coverUrl:
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/324160/library_600x900.jpg",
    summary: "",
    score: null,
    priority: 50,
  },
];

function previewMetadataValues(workId: number) {
  const item = previewItems().find((entry) => entry.workId === workId);
  if (!item) {
    return null;
  }
  const update = previewWorkUpdates.get(workId);
  return {
    title: update?.title ?? item.title,
    originalTitle: update?.originalTitle ?? item.originalTitle,
    aliases: update?.aliases ?? [],
    description: update?.description ?? item.description,
    year: update?.year ?? item.year,
    tags: update?.tags ?? item.tags,
    developer: update?.developer ?? item.developer,
    publisher: update?.publisher ?? item.publisher,
    releaseDate: update?.releaseDate ?? null,
    edition: update?.edition ?? item.edition,
    language: update?.language ?? null,
    notes: update?.notes ?? item.previewGame?.notes ?? "",
    rating: update?.rating ?? item.rating,
    status: update?.status ?? item.status,
    favorite: update?.favorite ?? item.favorite,
    coverSource: previewCoverSources.get(workId) ?? null,
  };
}

function previewMetadataCurrent(
  values: NonNullable<ReturnType<typeof previewMetadataValues>>,
  field: string,
): MetadataValue {
  switch (field) {
    case "title":
      return values.title;
    case "original_title":
      return values.originalTitle;
    case "aliases":
      return values.aliases;
    case "description":
      return values.description;
    case "year":
      return values.year;
    case "tags":
      return values.tags;
    case "developer":
      return values.developer;
    case "publisher":
      return values.publisher;
    case "release_date":
      return values.releaseDate;
    case "cover":
      return values.coverSource;
    default:
      return null;
  }
}

function previewMetadataEmpty(value: MetadataValue): boolean {
  return (
    value === null ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && value.length === 0)
  );
}

function previewMetadataCandidateValue(
  candidate: PreviewMetadataCandidate,
  field: string,
): MetadataValue {
  switch (field) {
    case "title":
      return candidate.title;
    case "original_title":
      return candidate.originalTitle;
    case "aliases":
      return candidate.aliases;
    case "description":
      return candidate.description;
    case "year":
      return candidate.year;
    case "tags":
      return candidate.tags;
    case "developer":
      return candidate.developer;
    case "publisher":
      return candidate.publisher;
    case "release_date":
      return candidate.releaseDate;
    default:
      return null;
  }
}

const previewMetadataFieldLabels: [string, string][] = [
  ["title", "标题"],
  ["original_title", "原题"],
  ["aliases", "别名"],
  ["description", "简介"],
  ["year", "年份"],
  ["tags", "标签"],
  ["developer", "开发商"],
  ["publisher", "发行商"],
  ["release_date", "发行日期"],
];

function previewMetadataProvidersSorted(): MetadataProvider[] {
  return [...previewMetadataProviders].sort(
    (left, right) => left.priority - right.priority || left.id.localeCompare(right.id),
  );
}

function previewMetadataWorkState(workId: number): MetadataWorkState {
  const values = previewMetadataValues(workId);
  const claims = previewMetadataClaims.get(workId) ?? [];
  if (!values) {
    throw new Error("作品不存在");
  }
  const fields: MetadataFieldState[] = previewMetadataFieldLabels.map(([field, label]) => {
    const current = previewMetadataCurrent(values, field);
    const fieldClaims = claims.filter((claim) => claim.field === field);
    const sourceClaim = fieldClaims.find(
      (claim) => JSON.stringify(claim.value) === JSON.stringify(current),
    );
    const lockedClaim = fieldClaims.find((claim) => claim.locked);
    const nonEmpty = fieldClaims.filter((claim) => !previewMetadataEmpty(claim.value));
    const conflict = new Set(nonEmpty.map((claim) => JSON.stringify(claim.value))).size > 1;
    return {
      field,
      label,
      current,
      source: sourceClaim?.source ?? null,
      sourceId: sourceClaim?.sourceId ?? null,
      locked: Boolean(lockedClaim),
      lockSource: lockedClaim?.source ?? null,
      conflict,
      preferredClaimId: [...nonEmpty].sort((a, b) => a.priority - b.priority)[0]?.id ?? null,
      currentClaimId: sourceClaim?.id ?? null,
      claims: fieldClaims,
    };
  });
  const coverClaims = claims.filter((claim) => claim.field === "cover");
  fields.push({
    field: "cover",
    label: "封面",
    current: values.coverSource,
    source: values.coverSource,
    sourceId: null,
    locked: coverClaims.some((claim) => claim.locked),
    lockSource: coverClaims.find((claim) => claim.locked)?.source ?? null,
    conflict: new Set(coverClaims.map((claim) => JSON.stringify(claim.value))).size > 1,
    preferredClaimId: [...coverClaims].sort((a, b) => a.priority - b.priority)[0]?.id ?? null,
    currentClaimId: null,
    claims: coverClaims,
  });
  return {
    workId,
    providers: previewMetadataProvidersSorted(),
    fields,
  };
}

const previewFieldLabels: Record<string, string> = {
  title: "标题",
  original_title: "原题",
  aliases: "别名",
  description: "简介",
  year: "年份",
  tags: "标签",
  developer: "开发商",
  publisher: "发行商",
  release_date: "发行日期",
  cover: "封面",
  related: "关联作品",
};

const previewFieldDefaults: Record<string, string[]> = {
  title: ["bangumi", "vndb", "nextmoe", "hikarinagi", "steam"],
  original_title: ["vndb", "bangumi", "nextmoe", "hikarinagi", "steam"],
  aliases: ["vndb", "bangumi", "nextmoe", "hikarinagi", "steam"],
  description: ["bangumi", "vndb", "nextmoe", "hikarinagi", "steam"],
  year: ["vndb", "bangumi", "nextmoe", "hikarinagi", "steam"],
  tags: ["vndb", "bangumi", "nextmoe", "hikarinagi", "steam"],
  developer: ["vndb", "steam", "nextmoe", "bangumi", "hikarinagi"],
  publisher: ["steam", "nextmoe", "vndb", "bangumi", "hikarinagi"],
  release_date: ["steam", "bangumi", "nextmoe", "vndb", "hikarinagi"],
  cover: ["vndb", "bangumi", "nextmoe", "hikarinagi", "steam"],
  related: ["vndb", "nextmoe"],
};

const previewFieldPriorityOverrides = new Map<string, string[]>();
let previewFieldPriorityGlobal = false;
const previewCoverSources = new Map<number, string | null>();

function previewFieldProviders(field: string): MetadataProvider[] {
  return previewMetadataProvidersSorted().filter((provider) => provider.fields.includes(field));
}

function previewFieldOrder(field: string): string[] {
  const available = previewFieldProviders(field).map((provider) => provider.id);
  if (previewFieldPriorityGlobal) {
    return available;
  }
  const override = previewFieldPriorityOverrides.get(field);
  if (override) {
    return [
      ...override.filter((id) => available.includes(id)),
      ...available.filter((id) => !override.includes(id)),
    ];
  }
  const preferred = previewFieldDefaults[field] ?? available;
  return [
    ...preferred.filter((id) => available.includes(id)),
    ...available.filter((id) => !preferred.includes(id)),
  ];
}

function previewFieldPriorityState(): FieldPriorityState[] {
  return Object.keys(previewFieldLabels).flatMap((field) => {
    const providers = previewFieldOrder(field).flatMap((id, index) => {
      const provider = previewMetadataProviders.find((entry) => entry.id === id);
      if (!provider) {
        return [];
      }
      return [
        {
          provider: id,
          providerName: provider.name,
          priority: (index + 1) * 10,
          enabled: provider.enabled,
        } satisfies FieldPriorityProvider,
      ];
    });
    return providers.length > 0
      ? [
          {
            field,
            label: previewFieldLabels[field] ?? field,
            providers,
            custom: !previewFieldPriorityGlobal && previewFieldPriorityOverrides.has(field),
            global: previewFieldPriorityGlobal,
          },
        ]
      : [];
  });
}

function previewMergeDetailsForWork(workId: number): PreviewMetadataCandidate[] {
  if (workId === 1) {
    return Object.values(previewMergeDetails);
  }
  const values = previewMetadataValues(workId);
  if (!values) {
    return [];
  }
  const titles = [values.title, values.originalTitle, ...values.aliases]
    .filter(Boolean)
    .map((title) => title.toLowerCase());
  const all = [...Object.values(previewMetadataDetails), ...Object.values(previewMergeDetails)];
  const byProvider = new Map<string, PreviewMetadataCandidate>();
  for (const detail of all) {
    const fields = [detail.title, detail.originalTitle]
      .filter(Boolean)
      .map((title) => title.toLowerCase());
    if (
      !fields.some((field) =>
        titles.some((title) => field.includes(title) || title.includes(field)),
      )
    ) {
      continue;
    }
    if (!byProvider.has(detail.provider)) {
      byProvider.set(detail.provider, detail);
    }
  }
  return [...byProvider.values()];
}

function previewMergePreview(workId: number, providerFilter?: string[]): MergePreview {
  const values = previewMetadataValues(workId);
  if (!values) {
    throw new Error("作品不存在");
  }
  const details = previewMergeDetailsForWork(workId).filter(
    (detail) => !providerFilter?.length || providerFilter.includes(detail.provider),
  );
  const claims = previewMetadataClaims.get(workId) ?? [];
  const fields: MergeFieldState[] = [];
  for (const [field, label] of previewMetadataFieldLabels) {
    const current = previewMetadataCurrent(values, field);
    const lockedClaim = claims.find((claim) => claim.field === field && claim.locked);
    const candidates: MergeFieldCandidate[] = details.flatMap((detail) => {
      const value = previewMetadataCandidateValue(detail, field);
      if (previewMetadataEmpty(value)) {
        return [];
      }
      return [
        {
          provider: detail.provider,
          providerName:
            previewMetadataProviders.find((provider) => provider.id === detail.provider)?.name ??
            detail.provider,
          sourceId: detail.sourceId,
          value,
          priority: previewFieldOrder(field).indexOf(detail.provider) * 10,
        },
      ];
    });
    if (candidates.length === 0) {
      continue;
    }
    candidates.sort((left, right) => left.priority - right.priority);
    const distinct = new Set(candidates.map((candidate) => JSON.stringify(candidate.value)));
    fields.push({
      field,
      label,
      current,
      locked: Boolean(lockedClaim),
      lockSource: lockedClaim?.source ?? null,
      candidates,
      defaultSelected: previewMetadataEmpty(current) && !lockedClaim,
      conflict: distinct.size > 1,
    });
  }
  const covers: MergeCoverCandidate[] = details.flatMap((detail) => {
    const options =
      detail.covers ??
      (detail.coverUrl ? [{ url: detail.coverUrl, kind: "cover", width: null, height: null }] : []);
    return options.map((cover) => ({
      provider: detail.provider,
      providerName:
        previewMetadataProviders.find((provider) => provider.id === detail.provider)?.name ??
        detail.provider,
      sourceId: detail.sourceId,
      url: cover.url,
      kind: cover.kind,
      priority: previewFieldOrder("cover").indexOf(detail.provider) * 10,
      defaultSelected: false,
    }));
  });
  covers.sort((left, right) => left.priority - right.priority);
  if (covers[0]) {
    covers[0] = { ...covers[0], defaultSelected: !values.coverSource };
  }
  return {
    workId,
    title: values.title,
    query: values.originalTitle || values.title,
    matched: details.map((detail) => ({
      provider: detail.provider,
      providerName:
        previewMetadataProviders.find((provider) => provider.id === detail.provider)?.name ??
        detail.provider,
      sourceId: detail.sourceId,
      title: detail.title,
      originalTitle: detail.originalTitle,
      year: detail.year,
      score: workId === 1 ? 1 : 0.9,
      priority:
        previewMetadataProviders.find((provider) => provider.id === detail.provider)?.priority ??
        100,
    })),
    errors: [],
    fields,
    covers,
  };
}

function previewEmptyUpdate(values: NonNullable<ReturnType<typeof previewMetadataValues>>) {
  return {
    title: values.title,
    originalTitle: values.originalTitle,
    aliases: values.aliases,
    description: values.description,
    year: values.year,
    developer: values.developer,
    publisher: values.publisher,
    edition: values.edition,
    language: values.language,
    releaseDate: values.releaseDate,
    tags: values.tags,
    notes: values.notes,
    rating: values.rating,
    status: values.status,
    favorite: values.favorite,
  };
}

function previewApplyCandidateField(
  update: ReturnType<typeof previewEmptyUpdate>,
  field: string,
  value: MetadataValue,
) {
  switch (field) {
    case "title":
      update.title = String(value);
      break;
    case "original_title":
      update.originalTitle = String(value);
      break;
    case "aliases":
      update.aliases = value as string[];
      break;
    case "description":
      update.description = String(value);
      break;
    case "year":
      update.year = value as number;
      break;
    case "tags":
      update.tags = value as string[];
      break;
    case "developer":
      update.developer = String(value);
      break;
    case "publisher":
      update.publisher = String(value);
      break;
    case "release_date":
      update.releaseDate = String(value);
      break;
  }
}

function previewMergeApply(request: MergeApplyRequest): MergeApplyResult {
  const values = previewMetadataValues(request.workId);
  if (!values) {
    throw new Error("作品不存在");
  }
  const claims = previewMetadataClaims.get(request.workId) ?? [];
  const lockedFields = new Set(claims.filter((claim) => claim.locked).map((claim) => claim.field));
  const update = previewEmptyUpdate(values);
  const applied: string[] = [];
  const skippedLocked: string[] = [];
  const skippedNonEmpty: string[] = [];
  const errors: string[] = [];
  for (const selection of request.selections) {
    if (lockedFields.has(selection.field)) {
      skippedLocked.push(selection.field);
      continue;
    }
    if (
      request.onlyIfEmpty &&
      !previewMetadataEmpty(previewMetadataCurrent(values, selection.field))
    ) {
      skippedNonEmpty.push(selection.field);
      continue;
    }
    const detail =
      previewMetadataDetails[`${selection.provider}:${selection.sourceId}`] ??
      previewMergeDetails[`${selection.provider}:${selection.sourceId}`];
    if (!detail) {
      errors.push(`${selection.provider}：候选不存在`);
      continue;
    }
    const value = previewMetadataCandidateValue(detail, selection.field);
    if (previewMetadataEmpty(value)) {
      continue;
    }
    previewApplyCandidateField(update, selection.field, value);
    const existing = claims.find(
      (claim) =>
        claim.field === selection.field &&
        claim.source === selection.provider &&
        claim.sourceId === selection.sourceId,
    );
    const provider = previewMetadataProviders.find((entry) => entry.id === selection.provider);
    if (existing) {
      existing.value = value;
      existing.fetchedAt = new Date().toISOString();
    } else {
      claims.push({
        id: previewMetadataClaimId++,
        field: selection.field,
        source: selection.provider,
        sourceId: selection.sourceId,
        value,
        confidence: 0.9,
        locked: false,
        fetchedAt: new Date().toISOString(),
        providerName: provider?.name ?? selection.provider,
        priority: provider?.priority ?? 100,
      });
    }
    applied.push(selection.field);
  }
  let coverApplied = false;
  if (request.cover) {
    if (lockedFields.has("cover")) {
      skippedLocked.push("cover");
    } else if (request.onlyIfEmpty && values.coverSource) {
      skippedNonEmpty.push("cover");
    } else {
      const detail =
        previewMetadataDetails[`${request.cover.provider}:${request.cover.sourceId}`] ??
        previewMergeDetails[`${request.cover.provider}:${request.cover.sourceId}`];
      if (!detail) {
        errors.push("封面候选不存在");
      } else {
        const coverUrl = request.cover.url ?? detail.coverUrl;
        if (!coverUrl) {
          errors.push("封面候选不存在");
        } else {
          previewCoverSources.set(request.workId, request.cover.provider);
          claims.push({
            id: previewMetadataClaimId++,
            field: "cover",
            source: request.cover.provider,
            sourceId: request.cover.sourceId,
            value: coverUrl,
            confidence: 0.9,
            locked: false,
            fetchedAt: new Date().toISOString(),
            providerName:
              previewMetadataProviders.find((entry) => entry.id === request.cover?.provider)
                ?.name ?? request.cover.provider,
            priority: 10,
          });
          coverApplied = true;
        }
      }
    }
  }
  previewWorkUpdates.set(request.workId, update);
  previewMetadataClaims.set(request.workId, claims);
  return { applied, skippedLocked, skippedNonEmpty, coverApplied, errors };
}

const previewBatchJobs = new Map<string, BatchWorkResult[]>();

async function previewMetadataBatch(
  workIds: number[],
  providerIds: string[],
): Promise<BatchWorkResult[]> {
  const results: BatchWorkResult[] = [];
  for (const workId of workIds) {
    await new Promise((resolve) => setTimeout(resolve, 110));
    const preview = previewMergePreview(workId, providerIds);
    const hasProposals = preview.fields.length > 0 || preview.covers.length > 0;
    results.push({
      jobId: "preview-batch",
      workId,
      title: preview.title,
      status: hasProposals ? "proposed" : "skipped",
      preview: hasProposals ? preview : null,
      error: null,
    });
  }
  previewBatchJobs.set("preview-batch", results);
  return results;
}

export async function listMetadataProviders(): Promise<MetadataProvider[]> {
  if (!isTauri()) {
    return previewMetadataProvidersSorted();
  }
  return invoke<MetadataProvider[]>("metadata_providers");
}

export async function reorderMetadataProviders(ids: string[]): Promise<void> {
  if (!isTauri()) {
    ids.forEach((id, index) => {
      const provider = previewMetadataProviders.find((entry) => entry.id === id);
      if (provider) {
        provider.priority = (index + 1) * 10;
      }
    });
    return;
  }
  await invoke("metadata_provider_reorder", { ids });
}

export async function setMetadataProviderEnabled(
  providerId: string,
  enabled: boolean,
): Promise<void> {
  if (!isTauri()) {
    const provider = previewMetadataProviders.find((entry) => entry.id === providerId);
    if (provider) {
      provider.enabled = enabled;
    }
    return;
  }
  await invoke("metadata_provider_set_enabled", { providerId, enabled });
}

export async function getMetadataWorkState(workId: number): Promise<MetadataWorkState> {
  if (!isTauri()) {
    return previewMetadataWorkState(workId);
  }
  return invoke<MetadataWorkState>("metadata_work_state", { workId });
}

export async function listMetadataFieldPriorities(): Promise<FieldPriorityState[]> {
  if (!isTauri()) {
    return previewFieldPriorityState();
  }
  return invoke<FieldPriorityState[]>("metadata_field_priorities");
}

export async function reorderMetadataFieldPriority(
  field: string,
  providerIds: string[],
): Promise<void> {
  if (!isTauri()) {
    previewFieldPriorityOverrides.set(field, providerIds);
    return;
  }
  await invoke("metadata_field_priority_reorder", { field, providerIds });
}

export async function resetMetadataFieldPriority(field: string): Promise<void> {
  if (!isTauri()) {
    previewFieldPriorityOverrides.delete(field);
    return;
  }
  await invoke("metadata_field_priority_reset", { field });
}

export async function setMetadataFieldPriorityGlobal(enabled: boolean): Promise<boolean> {
  if (!isTauri()) {
    previewFieldPriorityGlobal = enabled;
    return enabled;
  }
  return invoke<boolean>("metadata_set_field_priority_global", { enabled });
}

export async function getMetadataMergePreview(
  workId: number,
  providers?: string[],
): Promise<MergePreview> {
  if (!isTauri()) {
    return previewMergePreview(workId, providers);
  }
  return invoke<MergePreview>("metadata_merge_preview", { workId, providers: providers ?? null });
}

export async function applyMetadataMerge(request: MergeApplyRequest): Promise<MergeApplyResult> {
  if (!isTauri()) {
    return previewMergeApply(request);
  }
  return invoke<MergeApplyResult>("metadata_merge_apply", { request });
}

export async function adoptMetadataClaim(
  workId: number,
  claimId: number,
): Promise<MergeApplyResult> {
  if (!isTauri()) {
    const claims = previewMetadataClaims.get(workId) ?? [];
    const claim = claims.find((entry) => entry.id === claimId);
    if (!claim) {
      throw new Error("来源记录不存在");
    }
    return previewMergeApply({
      workId,
      selections:
        claim.field === "cover"
          ? []
          : [{ field: claim.field, provider: claim.source, sourceId: claim.sourceId }],
      cover:
        claim.field === "cover"
          ? {
              field: "cover",
              provider: claim.source,
              sourceId: claim.sourceId,
              url: typeof claim.value === "string" ? claim.value : null,
            }
          : null,
    });
  }
  return invoke<MergeApplyResult>("metadata_adopt_claim", { workId, claimId });
}

export async function previewMetadataBatchForUi(
  workIds: number[],
  providerIds: string[],
): Promise<BatchWorkResult[]> {
  return previewMetadataBatch(workIds, providerIds);
}

export async function startMetadataBatch(request: BatchStartRequest): Promise<MetadataJobStart> {
  if (!isTauri()) {
    return { jobId: "preview-batch" };
  }
  return invoke<MetadataJobStart>("metadata_batch_start", { request });
}

export async function pauseMetadataBatch(jobId: string, paused: boolean): Promise<boolean> {
  if (!isTauri()) {
    return true;
  }
  return invoke<boolean>("metadata_batch_pause", { jobId, paused });
}

export async function cancelMetadataBatch(jobId: string): Promise<boolean> {
  if (!isTauri()) {
    return true;
  }
  return invoke<boolean>("metadata_batch_cancel", { jobId });
}

export async function applyMetadataBatch(request: BatchApplyRequest): Promise<BatchApplyResult> {
  if (!isTauri()) {
    const proposals = previewBatchJobs.get(request.jobId) ?? [];
    const selected = new Set(
      request.workIds.length > 0 ? request.workIds : proposals.map((entry) => entry.workId),
    );
    const works: BatchApplyWorkResult[] = [];
    let appliedWorks = 0;
    const failedWorks = 0;
    let skippedWorks = 0;
    let appliedFields = 0;
    let coverApplied = 0;
    for (const proposal of proposals) {
      if (!selected.has(proposal.workId)) {
        continue;
      }
      const preview = proposal.preview;
      if (!preview) {
        skippedWorks += 1;
        works.push({
          workId: proposal.workId,
          title: proposal.title,
          status: "skipped",
          applied: [],
          skippedLocked: [],
          skippedNonEmpty: [],
          coverApplied: false,
          errors: [],
        });
        continue;
      }
      const selections: MergeSelection[] = preview.fields.flatMap((field) => {
        if (!field.defaultSelected || field.locked || !field.candidates[0]) {
          return [];
        }
        const candidate = field.candidates[0];
        return [{ field: field.field, provider: candidate.provider, sourceId: candidate.sourceId }];
      });
      const defaultCover = preview.covers.find((cover) => cover.defaultSelected);
      const cover =
        request.includeCovers && defaultCover
          ? {
              field: "cover",
              provider: defaultCover.provider,
              sourceId: defaultCover.sourceId,
              url: defaultCover.url,
            }
          : null;
      const result = previewMergeApply({
        workId: proposal.workId,
        selections,
        cover,
        onlyIfEmpty: true,
      });
      const status = result.applied.length > 0 || result.coverApplied ? "applied" : "skipped";
      if (status === "applied") appliedWorks += 1;
      else skippedWorks += 1;
      appliedFields += result.applied.length;
      if (result.coverApplied) coverApplied += 1;
      works.push({
        workId: proposal.workId,
        title: proposal.title,
        status,
        applied: result.applied,
        skippedLocked: result.skippedLocked,
        skippedNonEmpty: result.skippedNonEmpty,
        coverApplied: result.coverApplied,
        errors: result.errors,
      });
    }
    return {
      total: works.length,
      appliedWorks,
      failedWorks,
      skippedWorks,
      appliedFields,
      coverApplied,
      works,
    };
  }
  return invoke<BatchApplyResult>("metadata_batch_apply", { request });
}

export async function startMetadataSearch(
  workId: number,
  query: string,
  provider: string | null,
): Promise<MetadataJobStart> {
  if (!isTauri()) {
    return { jobId: "preview" };
  }
  return invoke<MetadataJobStart>("metadata_search_start", { workId, query, provider });
}

export async function searchMetadataPreview(
  workId: number,
  query: string,
  provider: string | null,
): Promise<MetadataSearchComplete> {
  await new Promise((resolve) => setTimeout(resolve, 280));
  const providers = provider
    ? previewMetadataProvidersSorted().filter((entry) => entry.id === provider)
    : previewMetadataProvidersSorted();
  const extra = previewMergeCandidates.filter(
    (entry) =>
      (!provider || entry.provider === provider) &&
      previewMetadataProviders.find((item) => item.id === entry.provider)?.enabled &&
      (entry.title.includes(query) ||
        entry.originalTitle.includes(query) ||
        query.includes(entry.title)),
  );
  const results = [
    ...providers.flatMap((entry) =>
      entry.enabled ? (previewMetadataCandidates[entry.id] ?? []) : [],
    ),
    ...extra,
  ].filter(
    (entry, index, list) =>
      list.findIndex(
        (item) => item.provider === entry.provider && item.sourceId === entry.sourceId,
      ) === index,
  );
  return {
    jobId: "preview",
    workId,
    query,
    results,
    errors: [],
    cancelled: false,
  };
}

export async function cancelMetadataSearch(jobId: string): Promise<boolean> {
  if (!isTauri()) {
    return jobId === "preview";
  }
  return invoke<boolean>("metadata_search_cancel", { jobId });
}

export async function getMetadataPreview(
  workId: number,
  provider: string,
  sourceId: string,
): Promise<MetadataPreview> {
  if (!isTauri()) {
    const values = previewMetadataValues(workId);
    const candidate =
      previewMetadataDetails[`${provider}:${sourceId}`] ??
      previewMergeDetails[`${provider}:${sourceId}`];
    if (!values || !candidate) {
      throw new Error("候选不存在");
    }
    const claims = previewMetadataClaims.get(workId) ?? [];
    const providerInfo = previewMetadataProviders.find((entry) => entry.id === provider);
    const fields = previewMetadataFieldLabels.flatMap(([field, label]) => {
      const candidateValue = previewMetadataCandidateValue(candidate, field);
      if (previewMetadataEmpty(candidateValue)) {
        return [];
      }
      const current = previewMetadataCurrent(values, field);
      const fieldClaims = claims.filter((claim) => claim.field === field);
      const lockedClaim = fieldClaims.find((claim) => claim.locked);
      return [
        {
          field,
          label,
          current,
          candidate: candidateValue,
          source: provider,
          sourceId,
          locked: Boolean(lockedClaim),
          lockSource: lockedClaim?.source ?? null,
          defaultSelected: previewMetadataEmpty(current) && !lockedClaim,
          priority: providerInfo?.priority ?? 100,
          existing: fieldClaims.map((claim) => ({
            source: claim.source,
            sourceId: claim.sourceId,
            value: claim.value,
            priority: claim.priority,
            locked: claim.locked,
          })),
        },
      ];
    });
    const coverOptions = (
      candidate.covers ??
      (candidate.coverUrl
        ? [{ url: candidate.coverUrl, kind: "cover", width: null, height: null }]
        : [])
    ).map((cover) => ({
      currentSource: values.coverSource,
      candidateUrl: cover.url,
      kind: cover.kind,
      defaultSelected: !values.coverSource,
      locked: false,
    }));
    return {
      workId,
      provider,
      providerName: providerInfo?.name ?? provider,
      sourceId,
      candidate,
      fields,
      cover: coverOptions[0] ?? null,
      coverOptions,
    };
  }
  return invoke<MetadataPreview>("metadata_candidate_preview", { workId, provider, sourceId });
}

export async function importMetadata(
  request: MetadataImportRequest,
): Promise<MetadataImportResult> {
  if (!isTauri()) {
    const values = previewMetadataValues(request.workId);
    const candidate = previewMetadataDetails[`${request.provider}:${request.sourceId}`];
    if (!values || !candidate) {
      throw new Error("候选不存在");
    }
    const claims = previewMetadataClaims.get(request.workId) ?? [];
    const lockedFields = new Set(
      claims.filter((claim) => claim.locked).map((claim) => claim.field),
    );
    const next = {
      title: values.title,
      originalTitle: values.originalTitle,
      aliases: values.aliases,
      description: values.description,
      year: values.year,
      developer: values.developer,
      publisher: values.publisher,
      edition: values.edition,
      language: values.language,
      releaseDate: values.releaseDate,
      tags: values.tags,
      notes: values.notes,
      rating: values.rating,
      status: values.status,
      favorite: values.favorite,
    };
    const applied: string[] = [];
    const skippedLocked: string[] = [];
    for (const field of request.selectedFields) {
      if (lockedFields.has(field)) {
        skippedLocked.push(field);
        continue;
      }
      const value = previewMetadataCandidateValue(candidate, field);
      if (previewMetadataEmpty(value)) {
        continue;
      }
      switch (field) {
        case "title":
          next.title = String(value);
          break;
        case "original_title":
          next.originalTitle = String(value);
          break;
        case "aliases":
          next.aliases = value as string[];
          break;
        case "description":
          next.description = String(value);
          break;
        case "year":
          next.year = value as number;
          break;
        case "tags":
          next.tags = value as string[];
          break;
        case "developer":
          next.developer = String(value);
          break;
        case "publisher":
          next.publisher = String(value);
          break;
        case "release_date":
          next.releaseDate = String(value);
          break;
      }
      applied.push(field);
    }
    if (request.selectedCover && lockedFields.has("cover")) {
      skippedLocked.push("cover");
    }
    const selectedCoverUrl = request.coverUrl ?? candidate.coverUrl;
    let coverApplied = false;
    if (request.selectedCover && !lockedFields.has("cover") && selectedCoverUrl) {
      previewCoverSources.set(request.workId, request.provider);
      const existingCover = claims.find(
        (claim) =>
          claim.field === "cover" &&
          claim.source === request.provider &&
          claim.sourceId === request.sourceId,
      );
      if (existingCover) {
        existingCover.value = selectedCoverUrl;
        existingCover.fetchedAt = new Date().toISOString();
      } else {
        const providerInfo = previewMetadataProviders.find(
          (entry) => entry.id === request.provider,
        );
        claims.push({
          id: previewMetadataClaimId++,
          field: "cover",
          source: request.provider,
          sourceId: request.sourceId,
          value: selectedCoverUrl,
          confidence: 0.9,
          locked: false,
          fetchedAt: new Date().toISOString(),
          providerName: providerInfo?.name ?? request.provider,
          priority: providerInfo?.priority ?? 100,
        });
      }
      coverApplied = true;
    }
    previewWorkUpdates.set(request.workId, next);
    const now = new Date().toISOString();
    const providerInfo = previewMetadataProviders.find((entry) => entry.id === request.provider);
    for (const field of applied) {
      const value = previewMetadataCandidateValue(candidate, field);
      const existing = claims.find(
        (claim) =>
          claim.field === field &&
          claim.source === request.provider &&
          claim.sourceId === request.sourceId,
      );
      if (existing) {
        existing.value = value;
        existing.fetchedAt = now;
      } else {
        claims.push({
          id: previewMetadataClaimId++,
          field,
          source: request.provider,
          sourceId: request.sourceId,
          value,
          confidence: 0.9,
          locked: false,
          fetchedAt: now,
          providerName: providerInfo?.name ?? request.provider,
          priority: providerInfo?.priority ?? 100,
        });
      }
    }
    previewMetadataClaims.set(request.workId, claims);
    return {
      applied,
      skippedLocked,
      coverApplied,
    };
  }
  return invoke<MetadataImportResult>("metadata_import", { request });
}

export async function setMetadataFieldLock(
  workId: number,
  field: string,
  locked: boolean,
): Promise<void> {
  if (!isTauri()) {
    const claims = previewMetadataClaims.get(workId) ?? [];
    const fieldClaims = claims.filter((claim) => claim.field === field);
    if (locked && fieldClaims.length === 0) {
      const values = previewMetadataValues(workId);
      const value = values ? previewMetadataCurrent(values, field) : null;
      claims.push({
        id: previewMetadataClaimId++,
        field,
        source: "manual",
        sourceId: "",
        value,
        confidence: null,
        locked: true,
        fetchedAt: new Date().toISOString(),
        providerName: "手动编辑",
        priority: 0,
      });
    } else {
      fieldClaims.forEach((claim) => {
        claim.locked = locked;
      });
    }
    previewMetadataClaims.set(workId, claims);
    return;
  }
  await invoke("metadata_set_field_lock", { workId, field, locked });
}

const previewOAuthStatuses: OAuthStatus[] = [
  {
    id: "bangumi",
    name: "Bangumi",
    description: "Bangumi 账号、收藏与评分",
    authKind: "oauth2",
    configured: true,
    connected: false,
    accountName: null,
    accountId: null,
    scopes: [],
    expiresAt: null,
    hint: "需要 Bangumi 应用凭证和 client_secret",
  },
  {
    id: "nextmoe",
    name: "Kungal / NextMoe",
    description: "Kungal / NextMoe 账号与用户数据",
    authKind: "oauth2_pkce",
    configured: true,
    connected: false,
    accountName: null,
    accountId: null,
    scopes: ["openid", "profile", "catalog:read"],
    expiresAt: null,
    hint: "public client + PKCE，不需要 client_secret",
  },
  {
    id: "hikarinagi",
    name: "Hikarinagi",
    description: "Hikarinagi 账号、收藏与状态",
    authKind: "oauth2_pkce",
    configured: true,
    connected: false,
    accountName: null,
    accountId: null,
    scopes: ["openid", "profile", "catalog:read", "user:read", "offline_access"],
    expiresAt: null,
    hint: "public client + PKCE，需要 openid/profile/offline_access",
  },
];

export async function listOAuthAccounts(): Promise<OAuthStatus[]> {
  if (!isTauri()) {
    return previewOAuthStatuses;
  }
  return invoke<OAuthStatus[]>("oauth_status");
}

const previewOAuthConfig: OAuthConfigInfo = {
  path: "preview/providers.json",
  error: null,
  checkedPaths: [],
  dataDir: "preview",
  providerIds: ["bangumi", "hikarinagi", "nextmoe"],
};

export async function getOAuthConfigInfo(): Promise<OAuthConfigInfo> {
  if (!isTauri()) {
    return previewOAuthConfig;
  }
  return invoke<OAuthConfigInfo>("oauth_config_info");
}

export async function importOAuthConfig(sourcePath: string): Promise<OAuthConfigInfo> {
  if (!isTauri()) {
    throw new Error("浏览器预览不支持导入 OAuth 配置；请在 Tauri 窗口中操作。");
  }
  return invoke<OAuthConfigInfo>("oauth_import_config", { sourcePath });
}

export async function connectOAuth(providerId: string): Promise<OAuthStatus> {
  if (!isTauri()) {
    throw new Error("浏览器预览不支持 OAuth 登录；请在 Tauri 窗口中使用。");
  }
  return invoke<OAuthStatus>("oauth_connect", { providerId });
}

export async function disconnectOAuth(providerId: string): Promise<void> {
  if (!isTauri()) {
    throw new Error("浏览器预览不支持 OAuth 登录；请在 Tauri 窗口中使用。");
  }
  await invoke("oauth_disconnect", { providerId });
}
