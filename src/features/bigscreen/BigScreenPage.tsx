import { ArrowLeft, Gamepad2, Play, Radio, Shuffle } from "lucide-react";
import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CoverArt } from "../../design-system/components/CoverArt";
import { WindowBar } from "../../design-system/components/WindowBar";
import { games, featuredGame, recentGames, recentlyAdded } from "../../lib/game-data";
import "./bigscreen.css";

function isProbeWindow() {
  return isTauri() && getCurrentWindow().label === "bigscreen-probe";
}

export function BigScreenPage() {
  const navigate = useNavigate();
  const [standalone] = useState(() => isProbeWindow());
  const [focusIndex, setFocusIndex] = useState(0);
  const shelf = [
    ...new Map(
      [...recentGames, ...recentlyAdded, ...games].map((game) => [game.id, game]),
    ).values(),
  ].slice(0, 8);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (standalone) {
          void getCurrentWindow().close();
        } else {
          navigate("/library");
        }
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setFocusIndex((index) => Math.min(index + 1, shelf.length - 1));
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setFocusIndex((index) => Math.max(index - 1, 0));
      }

      if (event.key.toLowerCase() === "y") {
        if (standalone) {
          toast("随机推荐将在 C7 的大屏焦点流中接入。");
          return;
        }
        const game = games[Math.floor(Math.random() * games.length)] ?? featuredGame;
        navigate(`/work/${game.id}`);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, shelf.length, standalone]);

  useEffect(() => {
    const card = document.querySelector<HTMLElement>(`[data-bigscreen-card="${focusIndex}"]`);
    card?.focus();
  }, [focusIndex]);

  const exit = () => {
    if (standalone) {
      void getCurrentWindow().close();
    } else {
      navigate("/library");
    }
  };

  const openDetail = (id: string) => {
    if (standalone) {
      toast("大屏详情抽屉将在 C7 接入。");
    } else {
      navigate(`/work/${id}`);
    }
  };

  return (
    <div className="bigscreen-root">
      <WindowBar context="大屏模式" />
      <main className="bigscreen-main">
        <header className="bigscreen-header">
          <div className="bigscreen-brand">
            <span>MIYU</span>
            <em>LOCAL LIBRARY</em>
          </div>
          <div className="bigscreen-status">
            <span>
              <Radio size={12} strokeWidth={1.5} /> {standalone ? "大屏窗口" : "主窗口预览"}
            </span>
            <span>本周 6.4 小时</span>
            <button type="button" onClick={exit}>
              <ArrowLeft size={14} strokeWidth={1.7} />
              退出大屏
            </button>
          </div>
        </header>

        <div className="bigscreen-layout">
          <section className="bigscreen-hero">
            <div className="bigscreen-hero__copy">
              <p>
                <span className="app-status-dot" /> 最近启动
              </p>
              <h1>{featuredGame.title}</h1>
              <p className="bigscreen-hero__original">{featuredGame.originalTitle}</p>
              <p className="bigscreen-hero__desc">{featuredGame.description}</p>
              <div className="bigscreen-hero__data">
                <span>累计 {featuredGame.playtime}</span>
                <i />
                <span>{featuredGame.launchCount} 次启动</span>
                <i />
                <span>上次 {featuredGame.lastPlayed}</span>
              </div>
              <div className="bigscreen-actions">
                <button type="button" className="bigscreen-primary">
                  <Play size={18} fill="currentColor" strokeWidth={0} />
                  启动游戏
                </button>
                <button
                  type="button"
                  className="bigscreen-secondary"
                  onClick={() => openDetail(featuredGame.id)}
                >
                  游戏详情
                </button>
              </div>
            </div>
            <div className="bigscreen-cover">
              <CoverArt work={featuredGame} />
            </div>
            <div className="bigscreen-hero__hint">
              <Gamepad2 size={16} strokeWidth={1.5} />
              <span>方向键移动 · Enter 确认 · Y 随机 · Esc 返回</span>
            </div>
          </section>

          <aside className="bigscreen-side">
            <header>
              <span>今晚想玩</span>
              <button type="button" onClick={() => setFocusIndex(0)}>
                <Shuffle size={13} strokeWidth={1.6} />
                随机
              </button>
            </header>
            {recentGames.map((game) => (
              <button
                key={game.id}
                type="button"
                className="bigscreen-list-item"
                onClick={() => openDetail(game.id)}
              >
                <CoverArt work={game} />
                <span>
                  <b>{game.title}</b>
                  <em>{game.originalTitle}</em>
                  <small>
                    {game.playtime} · 上次 {game.lastPlayed}
                  </small>
                </span>
              </button>
            ))}
          </aside>
        </div>

        <section className="bigscreen-shelf" aria-label="最近游戏">
          <header>
            <span>最近游戏</span>
            <em>用方向键浏览</em>
          </header>
          <div className="bigscreen-shelf__row">
            {shelf.map((game, index) => (
              <button
                key={`${game.id}-${index}`}
                type="button"
                data-bigscreen-card={index}
                tabIndex={focusIndex === index ? 0 : -1}
                className="bigscreen-card"
                onClick={() => openDetail(game.id)}
              >
                <CoverArt work={game} />
                <span>{game.title}</span>
                <small>{game.playtime}</small>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
