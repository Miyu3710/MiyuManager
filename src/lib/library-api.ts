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
} from "./library-types";
import { formatBytes, formatPlaytime, formatRelativeDate } from "./format";

type PreviewLibraryItem = LibraryItem & { previewGame?: Game };

const previewImported: PreviewLibraryItem[] = [];
const previewRemoved = new Set<number>();
const previewExclusions: ScanExclusion[] = [];
const previewStatus = new Map<number, LibraryStatus>();
const previewFavorite = new Map<number, boolean>();
const previewWorkUpdates = new Map<number, WorkUpdateInput>();
const previewLaunchProfiles = new Map<number, LaunchProfile>();
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
    const item = previewItems().find((candidate) => libraryItemId(candidate) === id);
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
      playtime: formatPlaytime(item.playtimeMinutes),
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
    playtime: formatPlaytime(item.playtimeMinutes),
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
