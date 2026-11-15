import { ArrowLeft, ArrowRight, Clock3, FolderOpen, Monitor, Play, Radio } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CoverArt } from "../../../design-system/components/CoverArt";
import { statusLabels } from "../data";
import type { Work } from "../types";

export function ChannelDetail({ work }: { work: Work }) {
  return (
    <div className="channel-detail">
      <div className="channel-back">
        <Link to="/prototype/channel/library">
          <ArrowLeft size={13} strokeWidth={1.5} />
          游戏库
        </Link>
        <span>GAME FILE / {work.catalogNo}</span>
      </div>

      <section className="channel-detail__stage">
        <div className="channel-detail__backdrop" aria-hidden="true">
          <CoverArt work={work} />
        </div>
        <div className="channel-detail__poster">
          <CoverArt work={work} />
        </div>
        <div className="channel-detail__wash" aria-hidden="true" />
        <div className="channel-detail__osd">
          <p className="channel-now">
            <span>GAME FILE</span>
            <i />
            {work.year} · {work.developer}
          </p>
          <h1>{work.title}</h1>
          <p className="channel-detail__original">
            {work.originalTitle}
            <span>{work.romaji}</span>
          </p>
          <p className="channel-detail__route">
            个人评分 {work.score.toFixed(1)} / 10 · {work.launchCount} 次启动
          </p>
          <div className="channel-tags">
            {work.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
            <span className="channel-tags__rating">{work.ageRating}</span>
          </div>
          <div className="channel-actions">
            <button
              type="button"
              className="channel-button channel-button--primary"
              onClick={() => toast("原型预览：启动功能在主应用作品详情页中提供。")}
            >
              <Play size={14} fill="currentColor" strokeWidth={0} />
              启动游戏
            </button>
            <button type="button" className="channel-button channel-button--ghost">
              修改启动参数
              <ArrowRight size={13} strokeWidth={1.6} />
            </button>
          </div>
        </div>
        <span className="channel-detail__number" aria-hidden="true">
          04
        </span>
        <span className="channel-detail__live">
          <Radio size={11} strokeWidth={1.5} />
          LOCAL GAME
        </span>
      </section>

      <div className="channel-detail__info">
        <section className="channel-facts">
          <h2>游戏资料</h2>
          <div>
            <span>发售</span>
            <b>{work.year} 年</b>
          </div>
          <div>
            <span>开发商</span>
            <b>{work.developer}</b>
          </div>
          <div>
            <span>引擎 / 版本</span>
            <b>
              {work.engine} · {work.edition}
            </b>
          </div>
          <div>
            <span>平台 / 语言</span>
            <b>Windows · 日语 / 简体中文</b>
          </div>
          <div>
            <span>库编号</span>
            <b>{work.catalogNo}</b>
          </div>
          <div>
            <span>元数据来源</span>
            <b>{work.source}</b>
          </div>
        </section>

        <section className="channel-playback">
          <h2>游玩数据</h2>
          <div className="channel-playback__big">
            <b className="channel-playback__time">{work.playtime}</b>
            <span>{statusLabels[work.status]}</span>
          </div>
          <div className="channel-playback__stats">
            <div>
              <span>上次游玩</span>
              <b>{work.lastPlayed}</b>
            </div>
            <div>
              <span>启动次数</span>
              <b>{work.launchCount} 次</b>
            </div>
            <div>
              <span>安装大小</span>
              <b>{work.installedSize}</b>
            </div>
          </div>
        </section>

        <section className="channel-launch">
          <h2>启动配置</h2>
          <p>
            <FolderOpen size={12} strokeWidth={1.5} />
            D:\Games\月影工房\game.exe
          </p>
          <p>
            <Monitor size={12} strokeWidth={1.5} />
            主显示器 · 全屏
          </p>
          <p>
            <Clock3 size={12} strokeWidth={1.5} />
            Locale Emulator · 日语
          </p>
          <button
            type="button"
            onClick={() => toast("原型预览：路径校验在主应用作品详情页中提供。")}
          >
            校验并保存
            <ArrowRight size={12} strokeWidth={1.6} />
          </button>
        </section>
      </div>

      <div className="channel-detail__bottom">
        <section>
          <h2>游戏简介</h2>
          <p>{work.description}</p>
          <p>
            原型使用虚构游戏与本地 mock
            数据。正式版本会在这里显示可追溯的字段来源、发行版本和本地安装。
          </p>
        </section>
        <section className="channel-session">
          <h2>最近游玩</h2>
          <div>
            <span>11.13 / 23:18</span>
            <b>1:42:06</b>
            <em>正常结束</em>
          </div>
          <div>
            <span>11.11 / 21:04</span>
            <b>2:06:44</b>
            <em>正常结束</em>
          </div>
          <div>
            <span>11.09 / 22:40</span>
            <b>0:54:12</b>
            <em>手动结束</em>
          </div>
        </section>
      </div>
    </div>
  );
}
