import { invoke, isTauri } from "@tauri-apps/api/core";
import type { BangumiComment, BangumiCommentPage, BangumiSyncOutcome } from "./library-types";

export interface WorkSourceRating {
  provider: string | null;
  label: string | null;
  score: number | null;
}

const previewComments: BangumiComment[] = [
  {
    id: 1,
    userId: 11,
    username: "preview-miyu",
    nickname: "Miyu",
    avatarUrl: "",
    collectionType: 2,
    rate: 9,
    comment: "美术和配乐很稳，日常段落的节奏也很舒服。",
    updatedAt: 1760000000,
    isOwn: true,
  },
  {
    id: 2,
    userId: 12,
    username: "preview-002",
    nickname: "海边散步",
    avatarUrl: "",
    collectionType: 2,
    rate: 8,
    comment: "后半段的展开比预想中克制，留白很对味。",
    updatedAt: 1759900000,
    isOwn: false,
  },
  {
    id: 3,
    userId: 13,
    username: "preview-003",
    nickname: "白昼梦",
    avatarUrl: "",
    collectionType: 3,
    rate: 0,
    comment: "还在推，先记录一下。夏天的空气感做得很好。",
    updatedAt: 1759800000,
    isOwn: false,
  },
  {
    id: 4,
    userId: 14,
    username: "preview-004",
    nickname: "雨声",
    avatarUrl: "",
    collectionType: 2,
    rate: 7,
    comment: "角色线各有亮点，结尾如果能再多一点铺垫会更好。",
    updatedAt: 1759700000,
    isOwn: false,
  },
  {
    id: 5,
    userId: 15,
    username: "preview-005",
    nickname: "晚风",
    avatarUrl: "",
    collectionType: 2,
    rate: 8,
    comment: "立绘和场景很有辨识度，音乐也值得单独听。",
    updatedAt: 1759600000,
    isOwn: false,
  },
  {
    id: 6,
    userId: 16,
    username: "preview-006",
    nickname: "纸灯",
    avatarUrl: "",
    collectionType: 4,
    rate: 6,
    comment: "暂时搁置，等有空再从头推一遍。",
    updatedAt: 1759500000,
    isOwn: false,
  },
];

const previewSourceRatings: Record<number, number> = {
  1: 7.1,
  2: 6.7,
  3: 8.1,
  4: 7.4,
};

function previewPage(subjectId: string, limit: number, offset: number): BangumiCommentPage {
  return {
    subjectId,
    total: previewComments.length,
    comments: previewComments.slice(offset, offset + limit),
    collectionUrl: "https://bgm.tv/subject/" + encodeURIComponent(subjectId) + "/comments",
  };
}

export async function getBangumiComments(
  subjectId: string,
  limit = 20,
  offset = 0,
): Promise<BangumiCommentPage> {
  if (!isTauri()) {
    return previewPage(subjectId, limit, offset);
  }
  return invoke<BangumiCommentPage>("bangumi_comments", { subjectId, limit, offset });
}

export async function getWorkSourceRating(workId: number): Promise<WorkSourceRating> {
  if (!isTauri()) {
    return {
      provider: "bangumi",
      label: "Bangumi",
      score: previewSourceRatings[workId] ?? null,
    };
  }
  return invoke<WorkSourceRating>("work_source_rating", { workId });
}

export async function syncBangumiComment(workId: number): Promise<BangumiSyncOutcome> {
  if (!isTauri()) {
    return {
      status: "skipped",
      message: "浏览器预览不会写入 Bangumi",
      collectionUrl: null,
    };
  }
  return invoke<BangumiSyncOutcome>("bangumi_sync_comment", { workId });
}

export async function syncBangumiProgress(workId: number): Promise<BangumiSyncOutcome> {
  if (!isTauri()) {
    return {
      status: "skipped",
      message: "浏览器预览不会写入 Bangumi",
      collectionUrl: null,
    };
  }
  return invoke<BangumiSyncOutcome>("bangumi_sync_progress", { workId });
}
