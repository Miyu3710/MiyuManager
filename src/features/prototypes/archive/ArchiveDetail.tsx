import { ArrowLeft, ArrowRight, Clock3, FolderOpen, Monitor, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CoverArt } from "../../../design-system/components/CoverArt";
import { statusLabels } from "../data";
import type { Work } from "../types";

export function ArchiveDetail({ work }: { work: Work }) {
  return (
    <div className="archive-detail">
      <div className="archive-back">
        <Link to="/prototype/archive/library">
          <ArrowLeft size={13} strokeWidth={1.5} />
          游戏库
        </Link>
        <span>游戏资料 {work.catalogNo}</span>
      </div>

      <div className="archive-detail__spread">
        <div className="archive-detail__object">
          <span className="archive-detail__stamp">GAME</span>
          <div className="archive-cover-mat archive-cover-mat--large">
            <CoverArt work={work} />
          </div>
          <div className="archive-object-caption">
            <span>{work.catalogNo}</span>
            <span>封面 / 包装 1.8 MB</span>
          </div>
        </div>

        <div className="archive-detail__body">
          <p className="archive-kicker">
            Galgame / AVG · {work.year} · {work.developer}
          </p>
          <h1>{work.title}</h1>
          <p className="archive-original">
            {work.originalTitle}
            <span>{work.romaji}</span>
          </p>
          <p className="archive-route">
            个人评分 {work.score.toFixed(1)} / 10 · {work.launchCount} 次启动
          </p>
          <dl className="archive-ledger">
            <div>
              <dt>发售日期</dt>
              <dd>{work.year} 年</dd>
            </div>
            <div>
              <dt>开发商</dt>
              <dd>{work.developer}</dd>
            </div>
            <div>
              <dt>引擎</dt>
              <dd>{work.engine}</dd>
            </div>
            <div>
              <dt>版本</dt>
              <dd>{work.edition}</dd>
            </div>
            <div>
              <dt>平台 / 语言</dt>
              <dd>Windows · 日语 / 简体中文</dd>
            </div>
            <div>
              <dt>游玩状态</dt>
              <dd>{statusLabels[work.status]}</dd>
            </div>
            <div>
              <dt>库编号</dt>
              <dd>{work.catalogNo}</dd>
            </div>
            <div>
              <dt>元数据来源</dt>
              <dd>{work.source}</dd>
            </div>
          </dl>
          <p className="archive-detail__desc">{work.description}</p>
          <div className="archive-actions">
            <button
              type="button"
              className="archive-button archive-button--primary"
              onClick={() => toast("原型预览：启动功能在主应用作品详情页中提供。")}
            >
              <Play size={13} fill="currentColor" strokeWidth={0} />
              启动游戏
            </button>
            <button type="button" className="archive-button archive-button--secondary">
              编辑启动配置
              <ArrowRight size={13} strokeWidth={1.6} />
            </button>
          </div>
        </div>

        <aside className="archive-detail__side">
          <div className="archive-side-stat">
            <span>累计时长</span>
            <b>{work.playtime}</b>
          </div>
          <div className="archive-side-stat">
            <span>上次游玩</span>
            <b>{work.lastPlayed}</b>
          </div>
          <div className="archive-side-stat">
            <span>个人评分</span>
            <b>{work.score.toFixed(1)} / 10</b>
          </div>
          <div className="archive-side-stat">
            <span>启动次数</span>
            <b>{work.launchCount} 次</b>
          </div>
          <div className="archive-side-stat">
            <span>安装大小</span>
            <b>{work.installedSize}</b>
          </div>
          <div className="archive-source-ledger">
            <h2>来源记录</h2>
            <div>
              <span>VNDB</span>
              <p>原题、开发商、标签</p>
              <em>11 月 11 日</em>
            </div>
            <div>
              <span>Bangumi</span>
              <p>中文标题、简介</p>
              <em>11 月 11 日</em>
            </div>
            <div>
              <span>本地</span>
              <p>封面、安装目录、启动路径</p>
              <em>11 月 12 日</em>
            </div>
          </div>
        </aside>
      </div>

      <div className="archive-detail__lower">
        <section>
          <h2>游戏简介</h2>
          <p>{work.description}</p>
          <p>
            原型游戏的标题、简介和来源均为 mock
            数据。正式版本会保留原始响应，并支持逐字段锁定、合并和修正。
          </p>
        </section>
        <section className="archive-session-ledger">
          <h2>游玩记录</h2>
          <div>
            <span>11 月 13 日 23:18</span>
            <b>1 小时 42 分</b>
            <em>正常结束</em>
          </div>
          <div>
            <span>11 月 11 日 21:04</span>
            <b>2 小时 06 分</b>
            <em>正常结束</em>
          </div>
          <div>
            <span>11 月 09 日 22:40</span>
            <b>0 小时 54 分</b>
            <em>手动结束</em>
          </div>
        </section>
        <section>
          <h2>本地安装</h2>
          <div className="archive-local">
            <p>
              <FolderOpen size={12} strokeWidth={1.5} />
              D:\Games\月影工房
            </p>
            <p>
              <Monitor size={12} strokeWidth={1.5} />
              主显示器 · 全屏
            </p>
            <p>
              <Clock3 size={12} strokeWidth={1.5} />
              Locale Emulator · 日语
            </p>
            <button type="button">在资源管理器中打开</button>
          </div>
        </section>
      </div>
    </div>
  );
}
