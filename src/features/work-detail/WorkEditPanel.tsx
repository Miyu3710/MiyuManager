import { isTauri } from "@tauri-apps/api/core";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check,
  ChevronDown,
  ImagePlus,
  Images,
  Loader2,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "../../design-system/components/Button";
import { CoverArt } from "../../design-system/components/CoverArt";
import { Hint } from "../../design-system/components/Hint";
import { syncBangumiProgress } from "../../lib/bangumi-api";
import {
  assetUrl,
  discoverWorkCovers,
  libraryItemToGame,
  pickImageFile,
  setWorkCover,
  updateWork,
  updateWorkSourceLinks,
} from "../../lib/library-api";
import type {
  CoverCandidate,
  LibraryItemDetail,
  LibraryStatus,
  MetadataProvider,
  WorkSourceLink,
} from "../../lib/library-types";
import { formatPlaytimeSeconds } from "../../lib/format";

const statuses = ["unclassified", "playing", "queued", "finished", "paused"] as const;

const statusOptions: { value: (typeof statuses)[number]; label: string }[] = [
  { value: "unclassified", label: "未分类" },
  { value: "playing", label: "在玩" },
  { value: "queued", label: "想玩" },
  { value: "finished", label: "已通关" },
  { value: "paused", label: "搁置" },
];

function StatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: LibraryStatus;
  disabled?: boolean;
  onChange: (value: LibraryStatus) => void;
}) {
  const selected = statusOptions.find((option) => option.value === value) ?? statusOptions[0]!;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="detail-select-trigger"
          aria-label={"游玩状态：" + selected.label}
          disabled={disabled}
        >
          <span className="detail-select-trigger__label">{selected.label}</span>
          <ChevronDown
            className="detail-select-trigger__chevron"
            size={14}
            strokeWidth={1.7}
            aria-hidden="true"
          />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="detail-select-menu"
          align="start"
          sideOffset={8}
          collisionPadding={12}
        >
          <p className="detail-select-menu__head">游玩状态</p>
          <DropdownMenu.RadioGroup
            value={value}
            onValueChange={(next) => onChange(next as LibraryStatus)}
          >
            {statusOptions.map((option) => (
              <DropdownMenu.RadioItem
                key={option.value}
                value={option.value}
                className="detail-select-menu__item"
              >
                <span>{option.label}</span>
                <DropdownMenu.ItemIndicator className="detail-select-menu__check">
                  <Check size={13} strokeWidth={2} />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

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

function buildSourceDrafts(providers: MetadataProvider[], links: WorkSourceLink[]) {
  const drafts: Record<string, string> = {};
  for (const link of links) {
    drafts[link.provider] = link.sourceId;
  }
  for (const provider of providers) {
    drafts[provider.id] ??= "";
  }
  return drafts;
}

function sourceSignature(providers: MetadataProvider[], links: WorkSourceLink[]) {
  return (
    providers.map((provider) => provider.id).join("|") +
    "::" +
    links.map((link) => link.provider + "=" + link.sourceId).join("|")
  );
}

function sourcePlaceholder(providerId: string) {
  switch (providerId) {
    case "bangumi":
      return "如 50756";
    case "vndb":
      return "如 v17";
    case "steam":
      return "AppID，如 324160";
    default:
      return "来源编号";
  }
}

interface WorkEditPanelProps {
  detail: LibraryItemDetail;
  sourceLinks: WorkSourceLink[];
  providers: MetadataProvider[];
  sourcesPending?: boolean;
  onChanged: () => void;
}

export function WorkEditPanel({
  detail,
  sourceLinks,
  providers,
  sourcesPending = false,
  onChanged,
}: WorkEditPanelProps) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(detail),
  });
  const signature = sourceSignature(providers, sourceLinks);
  const [sourceState, setSourceState] = useState(() => ({
    signature,
    drafts: buildSourceDrafts(providers, sourceLinks),
  }));
  const activeSourceState =
    sourceState.signature === signature
      ? sourceState
      : { signature, drafts: buildSourceDrafts(providers, sourceLinks) };
  const sourceDraft = activeSourceState.drafts;
  const [sourceBusy, setSourceBusy] = useState(false);
  const [bangumiSyncBusy, setBangumiSyncBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const statusValue = useWatch({ control, name: "status" });
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
      const nextRating = values.rating ? Number(values.rating) : null;
      const progressChanged = values.status !== detail.status || nextRating !== detail.rating;
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
        rating: nextRating,
        status: values.status as LibraryStatus,
        favorite: values.favorite,
      });
      reset(values);
      toast.success("作品资料已保存");
      onChanged();
      if (progressChanged) {
        try {
          const outcome = await syncBangumiProgress(detail.workId);
          if (outcome.status === "synced") {
            toast.success(outcome.message);
          }
        } catch (error) {
          toast.error("本地已保存，但 Bangumi 同步失败：" + String(error));
        }
      }
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

  const saveSourceLinks = async () => {
    setSourceBusy(true);
    try {
      const links = providers.map((provider) => {
        const existing = sourceLinks.find((link) => link.provider === provider.id);
        return {
          provider: provider.id,
          sourceId: (sourceDraft[provider.id] ?? "").trim(),
          title: existing?.title.trim() || detail.title,
        };
      });
      await updateWorkSourceLinks(detail.workId, links);
      toast.success("来源编号已保存");
      onChanged();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSourceBusy(false);
    }
  };

  const sourceDirty = providers.some((provider) => {
    const current = (sourceDraft[provider.id] ?? "").trim();
    const saved = sourceLinks.find((link) => link.provider === provider.id)?.sourceId.trim() ?? "";
    return current !== saved;
  });
  const bangumiLinked = sourceLinks.some(
    (link) => link.provider === "bangumi" && link.sourceId.trim().length > 0,
  );
  const bangumiSyncHint = !bangumiLinked
    ? "先在来源编号中填写 Bangumi 编号"
    : sourceDirty
      ? "先保存来源编号"
      : isDirty
        ? "先保存资料，再同步 Bangumi"
        : "使用已保存的游玩状态与评分";

  const syncBangumiNow = async () => {
    setBangumiSyncBusy(true);
    try {
      const outcome = await syncBangumiProgress(detail.workId);
      if (outcome.status === "synced") {
        toast.success(outcome.message);
      } else {
        toast(outcome.message);
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBangumiSyncBusy(false);
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

      <section className="work-edit-source-links" aria-labelledby="work-edit-source-links-title">
        <div className="work-edit-source-links__head">
          <div>
            <h3 id="work-edit-source-links-title">来源编号</h3>
            <p>手动修正来源条目标识；留空即解除关联。这里只改编号，不自动重新抓取资料。</p>
          </div>
          <div className="work-edit-source-links__actions">
            {sourceDirty ? <span className="work-edit-source-links__state">未保存</span> : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={sourceBusy || providers.length === 0 || !sourceDirty}
              onClick={() => void saveSourceLinks()}
            >
              {sourceBusy ? "保存中…" : "保存来源编号"}
            </Button>
          </div>
        </div>
        {providers.length === 0 ? (
          <p className="work-edit-source-links__empty">
            {sourcesPending ? "正在读取元数据来源…" : "没有可编辑的元数据来源。"}
          </p>
        ) : (
          <div className="work-edit-source-links__grid">
            {providers.map((provider) => (
              <label className="detail-field" key={provider.id}>
                <span>{provider.name}</span>
                <input
                  value={sourceDraft[provider.id] ?? ""}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSourceState((previous) => {
                      const base =
                        previous.signature === signature
                          ? previous
                          : { signature, drafts: buildSourceDrafts(providers, sourceLinks) };
                      return {
                        signature,
                        drafts: { ...base.drafts, [provider.id]: value },
                      };
                    });
                  }}
                  placeholder={sourcePlaceholder(provider.id)}
                  spellCheck={false}
                  disabled={sourceBusy}
                />
              </label>
            ))}
          </div>
        )}
      </section>

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
                <div className="detail-field">
                  <span>游玩状态</span>
                  <StatusSelect
                    value={statusValue}
                    disabled={isSubmitting}
                    onChange={(status) =>
                      setValue("status", status, { shouldDirty: true, shouldValidate: true })
                    }
                  />
                </div>
                <label className="detail-field">
                  <span>个人评分（0–10）</span>
                  <input inputMode="decimal" placeholder="8.5" {...register("rating")} />
                  {errors.rating ? <em>{errors.rating.message}</em> : null}
                </label>
                <label className="detail-field detail-field--check">
                  <input type="checkbox" {...register("favorite")} />
                  <span>本地收藏</span>
                </label>
              </div>
              <div className="work-edit-personal-note">
                <span>
                  本地收藏只用于 MiyuManager 的筛选；Bangumi
                  收藏由游玩状态与评分同步自动创建，两者分开计算。
                </span>
                <Hint label={bangumiSyncHint} side="top">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!bangumiLinked || sourceDirty || isDirty || bangumiSyncBusy}
                    onClick={() => void syncBangumiNow()}
                  >
                    <RefreshCw size={13} className={bangumiSyncBusy ? "detail-spin" : undefined} />
                    {bangumiSyncBusy ? "同步中…" : "同步 Bangumi 收藏"}
                  </Button>
                </Hint>
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
