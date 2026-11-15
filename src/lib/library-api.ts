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
];

const previewMetadataClaims = new Map<number, MetadataClaim[]>();
let previewMetadataClaimId = 1;

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
};

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
    coverSource: null as string | null,
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
    return {
      field,
      label,
      current,
      source: sourceClaim?.source ?? null,
      sourceId: sourceClaim?.sourceId ?? null,
      locked: Boolean(lockedClaim),
      lockSource: lockedClaim?.source ?? null,
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
    claims: coverClaims,
  });
  return {
    workId,
    providers: previewMetadataProvidersSorted(),
    fields,
  };
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
  const results = providers.flatMap((entry) =>
    entry.enabled ? (previewMetadataCandidates[entry.id] ?? []) : [],
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
    const candidate = previewMetadataDetails[`${provider}:${sourceId}`];
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
    return {
      workId,
      provider,
      providerName: providerInfo?.name ?? provider,
      sourceId,
      candidate,
      fields,
      cover: candidate.coverUrl
        ? {
            currentSource: values.coverSource,
            candidateUrl: candidate.coverUrl,
            defaultSelected: !values.coverSource,
            locked: false,
          }
        : null,
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
      coverApplied:
        request.selectedCover && !lockedFields.has("cover") && Boolean(candidate.coverUrl),
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
