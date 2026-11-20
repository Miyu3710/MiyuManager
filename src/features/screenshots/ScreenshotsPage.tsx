import { Camera, FolderOpen, Image as ImageIcon, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAppInfo } from "../library/useLibrary";
import { usePreferences } from "../../app/usePreferences";
import { Button } from "../../design-system/components/Button";
import { PageHeader } from "../../design-system/components/PageHeader";
import { openScreenshotDirectory } from "../../lib/screenshots-api";
import { ScreenshotGrid } from "./ScreenshotGrid";
import { ScreenshotLightbox } from "./ScreenshotLightbox";
import { useScreenshots } from "./useScreenshots";
import "./screenshots.css";

interface GameFilter {
  key: string;
  workId: number | null;
  title: string;
  count: number;
}

export function ScreenshotsPage() {
  const screenshots = useScreenshots();
  const preferences = usePreferences();
  const appInfo = useAppInfo();
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<number | null>(null);
  const items = useMemo(() => screenshots.data ?? [], [screenshots.data]);
  const hotkey = preferences.data?.screenshotHotkey || "Ctrl+Shift+F12";

  const groups = useMemo<GameFilter[]>(() => {
    const counts = new Map<string, GameFilter>();
    for (const item of items) {
      const key = item.workId === null ? "unclassified" : "work-" + item.workId;
      const current = counts.get(key);
      if (current) {
        current.count += 1;
      } else {
        counts.set(key, {
          key,
          workId: item.workId,
          title: item.workTitle || "未分类",
          count: 1,
        });
      }
    }
    return Array.from(counts.values()).sort((left, right) => {
      if (left.workId === null) {
        return 1;
      }
      if (right.workId === null) {
        return -1;
      }
      return right.count - left.count || left.title.localeCompare(right.title, "zh-CN");
    });
  }, [items]);

  const filtered = useMemo(() => {
    if (filter === "all") {
      return items;
    }
    return items.filter((item) => {
      const key = item.workId === null ? "unclassified" : "work-" + item.workId;
      return key === filter;
    });
  }, [filter, items]);

  const openFolder = () => {
    void openScreenshotDirectory().catch((error) => toast.error(String(error)));
  };

  return (
    <div className="screenshots-page">
      <PageHeader
        title="图库"
        description={
          items.length > 0
            ? `${items.length} 张截图 · 游戏内按 ${hotkey} 保存`
            : `游戏内按 ${hotkey} 保存画面；图片按作品标题归档。`
        }
        actions={
          <div className="screenshots-page__actions">
            <Link to="/settings#screenshot-settings" className="screenshots-page__settings-link">
              <Settings2 size={14} strokeWidth={1.7} /> 截图设置
            </Link>
            <Button variant="secondary" size="sm" onClick={openFolder}>
              <FolderOpen size={14} strokeWidth={1.7} /> 打开文件夹
            </Button>
          </div>
        }
      />

      <div className="screenshots-page__path" title={appInfo.data?.screenshotDir}>
        <ImageIcon size={13} strokeWidth={1.7} />
        <span>{appInfo.data?.screenshotDir ?? "正在读取截图目录…"}</span>
      </div>

      {items.length > 0 ? (
        <div className="screenshots-filters" role="tablist" aria-label="截图作品筛选">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            className={filter === "all" ? "is-active" : undefined}
            onClick={() => {
              setSelected(null);
              setFilter("all");
            }}
          >
            全部 <span>{items.length}</span>
          </button>
          {groups.map((group) => (
            <button
              type="button"
              role="tab"
              aria-selected={filter === group.key}
              className={filter === group.key ? "is-active" : undefined}
              key={group.key}
              onClick={() => {
                setSelected(null);
                setFilter(group.key);
              }}
            >
              {group.title} <span>{group.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      {screenshots.isPending ? (
        <div className="screenshot-gallery-skeleton" aria-label="正在读取图库" />
      ) : screenshots.isError ? (
        <div className="screenshot-error">
          <span>{String(screenshots.error)}</span>
          <Button variant="secondary" size="sm" onClick={() => void screenshots.refetch()}>
            重试
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="screenshots-empty">
          <span className="screenshots-empty__icon">
            <Camera size={28} strokeWidth={1.4} />
          </span>
          <h2>图库还是空的</h2>
          <p>启动一部游戏，在游戏画面中按 {hotkey}。成功后右下角会出现提示，图片会自动归档。</p>
          <div className="screenshots-empty__actions">
            <Button variant="secondary" size="sm" onClick={openFolder}>
              <FolderOpen size={14} strokeWidth={1.7} /> 打开截图目录
            </Button>
            <Link to="/settings#screenshot-settings" className="screenshots-page__settings-link">
              更改快捷键与目录
            </Link>
          </div>
        </div>
      ) : (
        <ScreenshotGrid items={filtered} onOpen={setSelected} showGame />
      )}

      <ScreenshotLightbox items={filtered} index={selected} onIndex={setSelected} />
    </div>
  );
}
