import {
  Bookmark,
  CheckCircle2,
  Clock3,
  Library,
  PauseCircle,
  PlayCircle,
  Star,
  type LucideIcon,
} from "lucide-react";
import type { LibraryFilter, LibrarySort } from "../../lib/library-types";

export type BigScreenCategory =
  "recent" | "playing" | "queued" | "finished" | "paused" | "favorite" | "all";

export interface BigScreenCategorySpec {
  id: BigScreenCategory;
  label: string;
  icon: LucideIcon;
  status: LibraryFilter;
  sort: LibrarySort;
  favoriteOnly?: boolean;
  playedOnly?: boolean;
}

export const bigScreenCategories: BigScreenCategorySpec[] = [
  {
    id: "recent",
    label: "最近启动",
    icon: Clock3,
    status: "all",
    sort: "last_played_desc",
    playedOnly: true,
  },
  { id: "playing", label: "在玩", icon: PlayCircle, status: "playing", sort: "last_played_desc" },
  { id: "queued", label: "想玩", icon: Bookmark, status: "queued", sort: "added_desc" },
  {
    id: "finished",
    label: "已完成",
    icon: CheckCircle2,
    status: "finished",
    sort: "last_played_desc",
  },
  { id: "paused", label: "搁置", icon: PauseCircle, status: "paused", sort: "last_played_desc" },
  {
    id: "favorite",
    label: "收藏",
    icon: Star,
    status: "all",
    sort: "last_played_desc",
    favoriteOnly: true,
  },
  { id: "all", label: "全部游戏", icon: Library, status: "all", sort: "title_asc" },
];

export function bigScreenCategorySpec(id: BigScreenCategory): BigScreenCategorySpec {
  return bigScreenCategories.find((category) => category.id === id) ?? bigScreenCategories[0]!;
}

export function bigScreenCategoryLabel(id: BigScreenCategory): string {
  return bigScreenCategorySpec(id).label;
}
