import { ArrowRight, ArrowUpRight, Clock3, FolderPlus, Library, Play } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { CoverArt } from "../../design-system/components/CoverArt";
import { EmptyState } from "../../design-system/components/EmptyState";
import { Tag } from "../../design-system/components/Tag";
import { statusLabels } from "../../lib/game-data";
import { libraryItemToGame, startWork } from "../../lib/library-api";
import { useHomeLibrary, useInvalidateLibrary, useLibrarySummary } from "../library/useLibrary";
import "./home.css";

export function HomePage() {
  const navigate = useNavigate();
  const library = useHomeLibrary();
  const summary = useLibrarySummary();
  const invalidate = useInvalidateLibrary();
  const [launchBusy, setLaunchBusy] = useState(false);
  const games = useMemo(() => (library.data?.items ?? []).map(libraryItemToGame), [library.data]);
  const featured = games[0];
  const recent = games.slice(1, 5);
  const added = games.slice(5, 11);
  const total = summary.data?.total ?? library.data?.total ?? 0;

  const handleLaunch = async () => {
    if (!featured?.workId) {
      return;
    }
    setLaunchBusy(true);
    try {
      await startWork(featured.workId);
      invalidate();
      toast.success("游戏进程已启动");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLaunchBusy(false);
    }
  };

  if (library.isPending) {
    return (
      <div className="home-page">
        <EmptyState
          title="正在读取本地游戏库"
          description="正在从 SQLite 读取作品、安装路径和最近入库记录。"
        />
      </div>
    );
  }

  if (library.isError) {
    return (
      <div className="home-page">
        <EmptyState
          title="无法读取游戏库"
          description={String(library.error)}
          action={
            <Button variant="secondary" size="sm" onClick={() => void library.refetch()}>
              重试
            </Button>
          }
        />
      </div>
    );
  }

  if (!featured) {
    return (
      <div className="home-page">
        <EmptyState
          className="home-empty"
          icon={<Library size={19} strokeWidth={1.5} />}
          title="把本地游戏收进一个库"
          description="选择包含 Galgame / AVG 的文件夹，扫描可执行文件并确认主程序。MiyuManager 会保存本地安装、启动路径、游玩状态和时长记录。"
          action={
            <Button variant="primary" size="sm" onClick={() => navigate("/library?import=1")}>
              <FolderPlus size={14} strokeWidth={1.8} />
              添加游戏目录
            </Button>
          }
        />
        <section className="home-empty__notes">
          <div>
            <span>01</span>
            <b>只读取本地文件</b>
            <p>扫描不会移动、修改或启动游戏文件。</p>
          </div>
          <div>
            <span>02</span>
            <b>确认主程序</b>
            <p>一个目录里的多个 exe 会作为候选列出。</p>
          </div>
          <div>
            <span>03</span>
            <b>数据留在本机</b>
            <p>默认写入 %APPDATA%\MiyuManager，不上传遥测。</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="home-page">
      <section className="home-hero">
        <span className="home-hero__kanji" aria-hidden="true">
          {featured.title.trim().charAt(0) || "月"}
        </span>
        <div className="home-hero__glow" aria-hidden="true" />
        <div className="home-hero__copy">
          <p className="app-kicker">
            <span className="app-status-dot" />
            {featured.isLocal ? "最近入库" : "上次游玩"} ·{" "}
            {featured.isLocal ? featured.addedAt : featured.lastPlayed}
          </p>
          <h1>{featured.title}</h1>
          {featured.originalTitle ? (
            <p className="home-hero__original">
              {featured.originalTitle}
              {featured.romaji ? <span>{featured.romaji}</span> : null}
            </p>
          ) : null}
          <p className="home-hero__desc">{featured.description}</p>
          <div className="home-tags">
            {featured.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
            {featured.isLocal ? <Tag tone="status">本地扫描</Tag> : null}
            {featured.ageRating !== "未标记" ? <Tag tone="data">{featured.ageRating}</Tag> : null}
          </div>
          <div className="home-meta">
            {featured.isLocal ? (
              <>
                <span>本地副本</span>
                <i />
                <span>待整理元数据</span>
              </>
            ) : (
              <>
                <span>{featured.engine}</span>
                <i />
                <span>{featured.edition}</span>
                <i />
                <span>{featured.source}</span>
              </>
            )}
          </div>
          <div className="home-actions">
            <Button variant="primary" disabled={launchBusy} onClick={() => void handleLaunch()}>
              <Play size={14} fill="currentColor" strokeWidth={0} />
              {launchBusy ? "正在启动…" : "启动游戏"}
              {featured.isLocal ? null : (
                <span className="home-actions__meta">{featured.edition}</span>
              )}
            </Button>
            <Button variant="secondary" onClick={() => navigate("/work/" + featured.id)}>
              游戏详情
              <ArrowUpRight size={14} strokeWidth={1.6} />
            </Button>
          </div>
          <div className="home-signal">
            <span>累计 {featured.playtime}</span>
            <i />
            <span>{featured.launchCount} 次启动</span>
            <i />
            <span>{featured.installedSize}</span>
          </div>
        </div>

        <div className="home-hero__poster">
          <span className="home-hero__no">
            {featured.catalogNo} / {featured.year ?? "年份未知"}
          </span>
          <CoverArt work={featured} />
          <p>
            <span>{featured.isLocal ? "入库" : "上次游玩"}</span>
            {featured.isLocal ? featured.addedAt : featured.lastPlayed}
          </p>
        </div>

        <div className="home-hero__side" aria-hidden="true">
          <span>PLAYER ONE / LOCAL</span>
          <i />
          <span>LIB {total}</span>
        </div>
      </section>

      {recent.length > 0 ? (
        <section className="home-section">
          <header className="home-section__head">
            <div>
              <span className="home-section__index">02</span>
              <h2>{featured.isLocal ? "最近入库" : "最近启动"}</h2>
              <em>{featured.isLocal ? "新加入本地库的游戏" : "再次启动上次玩过的游戏"}</em>
            </div>
            <Link to="/library">
              全部游戏
              <ArrowRight size={13} strokeWidth={1.5} />
            </Link>
          </header>
          <div className="home-recent">
            {recent.map((game) => (
              <Link to={"/work/" + game.id} className="home-recent__card" key={game.id}>
                <CoverArt work={game} />
                <div className="home-recent__copy">
                  <span className="home-card-status">{statusLabels[game.status]}</span>
                  <h3>{game.title}</h3>
                  <p>{game.originalTitle || "本地副本"}</p>
                  <small>
                    <Clock3 size={10} strokeWidth={1.6} />
                    {game.isLocal
                      ? "入库 " + game.addedAt
                      : game.playtime + " · 上次 " + game.lastPlayed}
                  </small>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {added.length > 0 ? (
        <section className="home-section">
          <header className="home-section__head">
            <div>
              <span className="home-section__index">03</span>
              <h2>{featured.isLocal ? "库中作品" : "最近入库"}</h2>
              <em>{total} 部游戏 · 全部保存在本地</em>
            </div>
            <Link to="/library">
              管理游戏库
              <ArrowRight size={13} strokeWidth={1.5} />
            </Link>
          </header>
          <div className="home-added">
            {added.map((game) => (
              <Link to={"/work/" + game.id} className="home-added__item" key={game.id}>
                <CoverArt work={game} />
                <div>
                  <h3>{game.title}</h3>
                  <p>{game.developer}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
