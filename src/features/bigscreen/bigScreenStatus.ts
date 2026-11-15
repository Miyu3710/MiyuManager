import type { LibraryStatus } from "../../lib/library-types";

export const bigScreenStatusOptions: Array<{ value: LibraryStatus; label: string }> = [
  { value: "unclassified", label: "未分类" },
  { value: "playing", label: "在玩" },
  { value: "queued", label: "想玩" },
  { value: "finished", label: "已完成" },
  { value: "paused", label: "搁置" },
];

export function bigScreenStatusLabel(value: LibraryStatus): string {
  return bigScreenStatusOptions.find((option) => option.value === value)?.label ?? "未分类";
}
