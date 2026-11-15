import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { X } from "lucide-react";
import { z } from "zod";
import { Button } from "../../design-system/components/Button";
import { updateWork } from "../../lib/library-api";
import type { LibraryItemDetail, LibraryStatus } from "../../lib/library-types";

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
  notes: z.string().max(4000, "备注不能超过 4000 个字符"),
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

interface WorkEditDialogProps {
  detail: LibraryItemDetail;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function WorkEditDialog({ detail, open, onClose, onSaved }: WorkEditDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(detail),
  });
  const restoreFocus = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      reset(defaultValues(detail));
    }
  }, [detail, open, reset]);

  useEffect(() => {
    if (!open) {
      return;
    }
    restoreFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = window.setTimeout(() => setFocus("title"), 0);
    return () => {
      window.clearTimeout(timer);
      restoreFocus.current?.focus();
    };
  }, [open, setFocus]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
      if (event.key === "Tab") {
        const root = dialogRef.current;
        if (!root) {
          return;
        }
        const focusable = Array.from(
          root.querySelectorAll<HTMLElement>(
            "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]",
          ),
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) {
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSubmitting, onClose, open]);

  if (!open) {
    return null;
  }

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
      toast.success("作品资料已保存");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(String(error));
    }
  });

  return (
    <div
      className="detail-edit-overlay"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="detail-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-edit-title"
      >
        <header className="detail-edit-dialog__head">
          <div>
            <p className="app-kicker">WORK PROFILE / 作品资料</p>
            <h2 id="work-edit-title">编辑资料</h2>
            <p>只修改本地资料；不会改动游戏目录或游戏内数据。</p>
          </div>
          <button
            type="button"
            className="detail-edit-dialog__close"
            aria-label="关闭编辑窗口"
            onClick={onClose}
            disabled={isSubmitting}
          >
            <X size={16} strokeWidth={1.6} />
          </button>
        </header>

        <form className="detail-edit-form" onSubmit={submit}>
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

          <div className="detail-form-grid detail-form-grid--three">
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

          <label className="detail-field">
            <span>用户备注（手动内容）</span>
            <textarea rows={3} placeholder="例如：二周目想走透子线" {...register("notes")} />
            {errors.notes ? <em>{errors.notes.message}</em> : null}
          </label>

          <footer className="detail-edit-dialog__actions">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
              {isSubmitting ? "正在保存…" : "保存资料"}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
