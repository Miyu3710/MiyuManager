import { isTauri } from "@tauri-apps/api/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Images, Loader2, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "../../design-system/components/Button";
import { CoverArt } from "../../design-system/components/CoverArt";
import {
  assetUrl,
  discoverWorkCovers,
  libraryItemToGame,
  pickImageFile,
  setWorkCover,
  updateWork,
} from "../../lib/library-api";
import type { CoverCandidate, LibraryItemDetail, LibraryStatus } from "../../lib/library-types";
import { formatPlaytimeSeconds } from "../../lib/format";

const statuses = ["unclassified", "playing", "queued", "finished", "paused"] as const;

const schema = z.object({
  title: z.string().trim().min(1, "标题不能为空").max(200, "标题不能超过 200 个字符"),
  originalTitle: z.string().max(200, "原题不能超过 200 个字符"),
  aliases: z.string().max(4000, "别名不能超过 4000 个字符"),
  description: z.string().max(8000, "简介不能超过 8000 个字符"),
  year: z
    .string()
    .regex(/^\d{4}$/, "年份需要是 4 位数字")
    .or(z.literal("")),
  developer: z.string().max(200, "开发商不能超过 200 个字符"),
  publisher: z.string().max(200, "发行商不能超过 200 个字符"),
  edition: z.string().max(100, "版本不能超过 100 个字符"),
  language: z.string().max(100, "语言不能超过 100 个字符"),
  releaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "发行日期需要是 YYYY-MM-DD")
    .or(z.literal("")),
  tags: z.string().max(2000, "标签不能超过 2000 个字符"),
  notes: z.string().max(4000, "评价内容不能超过 4000 个字符"),
  rating: z
    .string()
    .refine(
      (value) =>
        value === "" ||
        (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 10),
      "评分需要在 0 到 10 之间",
    ),
  status: z.enum(statuses),
  favorite: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

function splitList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,，;；]+/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function defaultValues(detail: LibraryItemDetail): FormValues {
  return {
    title: detail.title,
    originalTitle: detail.originalTitle,
    aliases: detail.aliases.join("\n"),
    description: detail.description,
    year: detail.year?.toString() ?? "",
    developer: detail.developer ?? "",
    publisher: detail.publisher ?? "",
    edition: detail.edition ?? "",
    language: detail.language ?? "",
    releaseDate: detail.releaseDate ?? "",
    tags: detail.tags.join("\n"),
    notes: detail.notes,
    rating: detail.rating?.toString() ?? "",
    status: detail.status,
    favorite: detail.favorite,
  };
}

interface WorkEditPanelProps {
  detail: LibraryItemDetail;
  onChanged: () => void;
}

export function WorkEditPanel({ detail, onChanged }: WorkEditPanelProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(detail),
  });
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverCandidates, setCoverCandidates] = useState<CoverCandidate[] | null>(null);
  const coverUrl = assetUrl(detail.coverPath) ?? assetUrl(detail.coverThumbPath);
  const game = libraryItemToGame(detail);
  const coverWork = { ...game, coverUrl };
  const playtimeSeconds = detail.playtimeSeconds ?? detail.playtimeMinutes * 60;
  const playtime = playtimeSeconds > 0 ? formatPlaytimeSeconds(playtimeSeconds) : "尚未记录";

  useEffect(() => {
    if (!isDirty) {
      reset(defaultValues(detail));
    }
  }, [detail, isDirty, reset]);

  const submit = handleSubmit(async (values) => {
    try {
      await updateWork(detail.workId, {
        title: values.title,
        originalTitle: values.originalTitle,
        aliases: splitList(values.aliases),
        description: values.description,
        year: values.year ? Number(values.year) : null,
        developer: values.developer || null,
        publisher: values.publisher || null,
        edition: values.edition || null,
        language: values.language || null,
        releaseDate: values.releaseDate || null,
        tags: splitList(values.tags),
        notes: values.notes,
        rating: values.rating ? Number(values.rating) : null,
        status: values.status as LibraryStatus,
        favorite: values.favorite,
      });
      reset(values);
      toast.success("作品资料已保存");
      onChanged();
    } catch (error) {
      toast.error(String(error));
    }
  });

  const handlePickCover = async () => {
    const selected = await pickImageFile();
    if (!selected) {
      return;
    }
    setCoverBusy(true);
    try {
      await setWorkCover(detail.workId, selected);
      onChanged();
      toast.success("封面已缓存");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setCoverBusy(false);
    }
  };

  const handleDiscoverCover = async () => {
    if (!isTauri()) {
      toast("浏览器预览不读取游戏目录；请在 Tauri 窗口中发现本地图片。");
      return;
    }
    try {
      const candidates = await discoverWorkCovers(detail.workId);
      setCoverCandidates(candidates);
      if (candidates.length === 0) {
        toast("游戏目录附近没有找到常见封面图片");
      }
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleApplyCandidate = async (candidate: CoverCandidate) => {
    setCoverBusy(true);
    try {
      await setWorkCover(detail.workId, candidate.path, true);
      setCoverCandidates(null);
      onChanged();
      toast.success("已使用本地封面图片");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setCoverBusy(false);
    }
  };

  return (
    <section className="work-edit-panel" id="work-edit-panel" tabIndex={-1}>
      <header className="work-edit-panel__head">
        <div>
          <h2>封面与资料</h2>
        </div>
        {isDirty ? <span className="work-edit-panel__state">未保存</span> : null}
      </header>

      <form className="work-edit-form" onSubmit={submit}>
        <div className="work-edit-top">
          <aside className="work-edit-cover" aria-label="封面编辑">
            <div className="work-edit-cover__frame">
              <CoverArt work={coverWork} />
            </div>
            <div className="work-edit-cover__actions">
              <Button
                variant="secondary"
                size="sm"
                disabled={coverBusy}
                onClick={() => void handlePickCover()}
              >
                {coverBusy ? (
                  <Loader2 size={13} className="detail-spin" />
                ) : (
                  <ImagePlus size={13} strokeWidth={1.6} />
                )}
                更换封面
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={coverBusy}
                onClick={() => void handleDiscoverCover()}
              >
                <Images size={13} strokeWidth={1.6} /> 本地图片
              </Button>
            </div>

            <p className="work-edit-cover__local">
              <span>
                {detail.installStatus === "missing" ? "路径缺失" : "已安装"}
                {" · "}
                {detail.platform}
                {" · "}
                {game.installedSize}
              </span>
              <span>累计游玩 {playtime}</span>
            </p>

            {coverCandidates ? (
              <div className="work-edit-cover__candidates" aria-live="polite">
                <header>
                  <b>
                    {coverCandidates.length > 0
                      ? `找到 ${coverCandidates.length} 张本地图片`
                      : "没有找到本地图片"}
                  </b>
                  <button
                    type="button"
                    aria-label="关闭本地图片列表"
                    onClick={() => setCoverCandidates(null)}
                  >
                    <X size={13} strokeWidth={1.8} />
                  </button>
                </header>
                {coverCandidates.length === 0 ? (
                  <p>游戏目录和常见封面子目录里没有匹配的图片。</p>
                ) : (
                  coverCandidates.map((candidate) => (
                    <button
                      type="button"
                      className="work-edit-cover__candidate"
                      key={candidate.path}
                      disabled={coverBusy}
                      onClick={() => void handleApplyCandidate(candidate)}
                    >
                      <span>{candidate.fileName}</span>
                      <em>
                        {candidate.width}×{candidate.height}
                      </em>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </aside>

          <div className="work-edit-primary">
            <section className="work-edit-group">
              <h3>基本信息</h3>
              <div className="detail-form-grid detail-form-grid--two">
                <label className="detail-field">
                  <span>标题</span>
                  <input {...register("title")} />
                  {errors.title ? <em>{errors.title.message}</em> : null}
                </label>
                <label className="detail-field">
                  <span>原题</span>
                  <input {...register("originalTitle")} />
                  {errors.originalTitle ? <em>{errors.originalTitle.message}</em> : null}
                </label>
              </div>
              <label className="detail-field">
                <span>别名（每行或逗号分隔）</span>
                <textarea rows={2} {...register("aliases")} />
                {errors.aliases ? <em>{errors.aliases.message}</em> : null}
              </label>
            </section>

            <section className="work-edit-group">
              <h3>我的记录</h3>
              <div className="work-edit-personal-grid">
                <label className="detail-field">
                  <span>游玩状态</span>
                  <select {...register("status")}>
                    <option value="unclassified">未分类</option>
                    <option value="playing">在玩</option>
                    <option value="queued">想玩</option>
                    <option value="finished">已通关</option>
                    <option value="paused">搁置</option>
                  </select>
                </label>
                <label className="detail-field">
                  <span>个人评分（0–10）</span>
                  <input inputMode="decimal" placeholder="8.5" {...register("rating")} />
                  {errors.rating ? <em>{errors.rating.message}</em> : null}
                </label>
                <label className="detail-field detail-field--check">
                  <input type="checkbox" {...register("favorite")} />
                  <span>收藏这部作品</span>
                </label>
              </div>
            </section>
          </div>
        </div>

        <section className="work-edit-group">
          <h3>发行资料</h3>
          <div className="detail-form-grid detail-form-grid--four">
            <label className="detail-field">
              <span>年份</span>
              <input inputMode="numeric" placeholder="2024" {...register("year")} />
              {errors.year ? <em>{errors.year.message}</em> : null}
            </label>
            <label className="detail-field">
              <span>发行日期</span>
              <input placeholder="YYYY-MM-DD" {...register("releaseDate")} />
              {errors.releaseDate ? <em>{errors.releaseDate.message}</em> : null}
            </label>
            <label className="detail-field">
              <span>版本</span>
              <input placeholder="正式版 / 体验版" {...register("edition")} />
              {errors.edition ? <em>{errors.edition.message}</em> : null}
            </label>
            <label className="detail-field">
              <span>语言</span>
              <input placeholder="日语 / 简体中文" {...register("language")} />
              {errors.language ? <em>{errors.language.message}</em> : null}
            </label>
          </div>
          <div className="detail-form-grid detail-form-grid--two">
            <label className="detail-field">
              <span>开发商</span>
              <input {...register("developer")} />
              {errors.developer ? <em>{errors.developer.message}</em> : null}
            </label>
            <label className="detail-field">
              <span>发行商</span>
              <input {...register("publisher")} />
              {errors.publisher ? <em>{errors.publisher.message}</em> : null}
            </label>
          </div>
        </section>

        <section className="work-edit-group">
          <h3>分类与简介</h3>
          <label className="detail-field">
            <span>标签（每行或逗号分隔）</span>
            <textarea rows={2} {...register("tags")} />
            {errors.tags ? <em>{errors.tags.message}</em> : null}
          </label>
          <label className="detail-field">
            <span>简介</span>
            <textarea rows={4} {...register("description")} />
            {errors.description ? <em>{errors.description.message}</em> : null}
          </label>
        </section>

        <section className="work-edit-group">
          <h3>用户评价</h3>
          <label className="detail-field">
            <span>评价内容</span>
            <textarea
              rows={3}
              placeholder="例如：美术和配乐很稳，二周目想换一条路线。"
              {...register("notes")}
            />
            {errors.notes ? <em>{errors.notes.message}</em> : null}
          </label>
        </section>

        <footer className="work-edit-actions">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!isDirty || isSubmitting}
            onClick={() => reset(defaultValues(detail))}
          >
            <RotateCcw size={13} strokeWidth={1.7} /> 重置修改
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? "正在保存…" : "保存资料"}
          </Button>
        </footer>
      </form>
    </section>
  );
}
