import { ArrowUpRight, Camera, FolderOpen } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { usePreferences } from "../../app/usePreferences";
import { openScreenshotDirectory } from "../../lib/screenshots-api";
import { ScreenshotEmpty, ScreenshotGrid } from "./ScreenshotGrid";
import { ScreenshotLightbox } from "./ScreenshotLightbox";
import { useScreenshots } from "./useScreenshots";
import "./screenshots.css";

export function WorkScreenshots({ workId }: { workId: number }) {
  const screenshots = useScreenshots(workId);
  const preferences = usePreferences();
  const [selected, setSelected] = useState<number | null>(null);
  const items = screenshots.data ?? [];
  const hotkey = preferences.data?.screenshotHotkey || "Ctrl+Shift+F12";

  const openFolder = () => {
    void openScreenshotDirectory().catch((error) => toast.error(String(error)));
  };

  return (
    <section className="work-screenshots" aria-busy={screenshots.isPending}>
      <header className="work-screenshots__head">
        <div>
          <h2>
            截图
            {items.length > 0 ? <span>{items.length}</span> : null}
          </h2>
          <p>游戏运行时按 {hotkey} 截图；图片按作品标题归档。</p>
        </div>
        <div className="work-screenshots__actions">
          <Button variant="ghost" size="sm" onClick={openFolder}>
            <FolderOpen size={14} strokeWidth={1.7} /> 打开文件夹
          </Button>
          <Link to="/screenshots" className="work-screenshots__gallery-link">
            全部截图 <ArrowUpRight size={13} strokeWidth={1.8} />
          </Link>
        </div>
      </header>

      {screenshots.isPending ? (
        <div className="screenshot-skeleton" aria-label="正在读取截图" />
      ) : screenshots.isError ? (
        <div className="screenshot-error">
          <span>{String(screenshots.error)}</span>
          <Button variant="secondary" size="sm" onClick={() => void screenshots.refetch()}>
            重试
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="work-screenshots__empty">
          <ScreenshotEmpty compact />
          <span className="work-screenshots__hotkey">
            <Camera size={14} strokeWidth={1.7} /> {hotkey}
          </span>
        </div>
      ) : (
        <ScreenshotGrid items={items} onOpen={setSelected} />
      )}

      <ScreenshotLightbox items={items} index={selected} onIndex={setSelected} />
    </section>
  );
}
