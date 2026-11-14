import type { CoverId } from "../../design-system/components/CoverArt";

export type Direction = "screening" | "archive" | "channel";

export type PrototypePage = "home" | "library" | "detail";

export type PlayStatus = "reading" | "queued" | "finished" | "paused";

export interface Work {
  id: string;
  title: string;
  originalTitle: string;
  romaji: string;
  year: number;
  developer: string;
  tags: string[];
  status: PlayStatus;
  playtime: string;
  lastPlayed: string;
  addedAt: string;
  score: number;
  description: string;
  cover: CoverId;
  catalogNo: string;
  source: string;
  engine: string;
  ageRating: "全年龄" | "18+";
  heroine: string;
  edition: "正式版" | "体验版";
  launchCount: number;
  lastSession: string;
  installedSize: string;
}

export interface DirectionMeta {
  id: Direction;
  index: string;
  name: string;
  subtitle: string;
  pitch: string;
  note: string;
  palette: { name: string; value: string }[];
  typeLabel: string;
}
