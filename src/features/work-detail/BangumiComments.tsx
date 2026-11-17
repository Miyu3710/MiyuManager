import { useInfiniteQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, MessageCircle, RefreshCw, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../design-system/components/Button";
import { Tag } from "../../design-system/components/Tag";
import { cn } from "../../lib/cn";
import { openExternalUrl } from "../../lib/app-api";
import { getBangumiComments } from "../../lib/bangumi-api";
import type { BangumiComment } from "../../lib/library-types";

const collectionTypeLabels: Record<number, string> = {
  1: "想玩",
  2: "玩过",
  3: "在玩",
  4: "搁置",
  5: "抛弃",
};

function commentDate(updatedAt: number): string {
  if (!updatedAt) {
    return "时间未知";
  }
  return new Date(updatedAt * 1000).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function Avatar({ comment }: { comment: BangumiComment }) {
  const [failed, setFailed] = useState(false);
  const label = Array.from(comment.nickname || comment.username || "B")[0] ?? "B";
  return (
    <span className="bangumi-comment__avatar" aria-hidden="true">
      {comment.avatarUrl && !failed ? (
        <img
          src={comment.avatarUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        label
      )}
    </span>
  );
}

export function BangumiComments({
  subjectId,
  pending = false,
}: {
  subjectId: string | null;
  pending?: boolean;
}) {
  const query = useInfiniteQuery({
    queryKey: ["bangumi-comments", subjectId],
    queryFn: ({ pageParam }) => getBangumiComments(subjectId as string, 20, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.comments.length, 0);
      if (lastPage.comments.length === 0 || loaded >= lastPage.total) {
        return undefined;
      }
      return loaded;
    },
    enabled: Boolean(subjectId),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const comments = useMemo(() => {
    const seen = new Set<number>();
    return (query.data?.pages ?? [])
      .flatMap((page) => page.comments)
      .filter((comment) => {
        if (seen.has(comment.id)) {
          return false;
        }
        seen.add(comment.id);
        return true;
      });
  }, [query.data]);

  const total = query.data?.pages[0]?.total ?? 0;
  const collectionUrl =
    query.data?.pages[0]?.collectionUrl ??
    (subjectId ? "https://bgm.tv/subject/" + encodeURIComponent(subjectId) + "/comments" : null);
  const authored = comments.filter((comment) => comment.isOwn).length;

  return (
    <section className="bangumi-comments-card" aria-labelledby="bangumi-comments-title">
      <header className="bangumi-comments__head">
        <div className="bangumi-comments__title">
          <span className="bangumi-comments__mark" aria-hidden="true">
            <img src="/bangumi-icon.png" alt="" width={18} height={18} />
          </span>
          <div>
            <h2 id="bangumi-comments-title">Bangumi 吐槽</h2>
            <p>公开收藏吐槽，按 Bangumi 的更新时间排列。</p>
          </div>
        </div>
        <div className="bangumi-comments__actions">
          {total > 0 ? <Tag tone="muted">{total} 条</Tag> : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={!subjectId || query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={13} className={cn(query.isFetching && "detail-spin")} />
            刷新
          </Button>
          {collectionUrl ? (
            <Button variant="ghost" size="sm" onClick={() => void openExternalUrl(collectionUrl)}>
              打开 Bangumi <ExternalLink size={12} strokeWidth={1.7} />
            </Button>
          ) : null}
        </div>
      </header>

      {pending && !subjectId ? (
        <div className="bangumi-comments__state">
          <Loader2 size={18} className="detail-spin" />
          正在查找 Bangumi 条目…
        </div>
      ) : !subjectId ? (
        <div className="bangumi-comments__empty">
          <MessageCircle size={22} strokeWidth={1.5} />
          <b>还没有关联 Bangumi 条目</b>
          <p>在「来源与字段」关联 Bangumi 后，这里会显示该条目的公开吐槽。</p>
        </div>
      ) : query.isPending ? (
        <div className="bangumi-comments__state">
          <Loader2 size={18} className="detail-spin" />
          正在读取 Bangumi 吐槽…
        </div>
      ) : query.isError ? (
        <div className="bangumi-comments__state is-error">
          <p>无法读取 Bangumi 吐槽：{String(query.error)}</p>
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            重试
          </Button>
        </div>
      ) : comments.length === 0 ? (
        <div className="bangumi-comments__empty">
          <MessageCircle size={22} strokeWidth={1.5} />
          <b>这个条目还没有公开吐槽</b>
          <p>可以先在 Bangumi 标记条目，评论同步后也会出现在这里。</p>
        </div>
      ) : (
        <>
          <div className="bangumi-comments__list">
            {comments.map((comment) => (
              <article
                className={cn("bangumi-comment", comment.isOwn && "is-own")}
                key={comment.id}
              >
                <Avatar comment={comment} />
                <div className="bangumi-comment__body">
                  <header>
                    <b>{comment.nickname || comment.username}</b>
                    {comment.isOwn ? <Tag tone="accent">我</Tag> : null}
                    {comment.rate > 0 ? (
                      <span className="bangumi-comment__rate">
                        <Star size={11} fill="currentColor" strokeWidth={0} />
                        {comment.rate}
                      </span>
                    ) : null}
                    {collectionTypeLabels[comment.collectionType] ? (
                      <span className="bangumi-comment__status">
                        {collectionTypeLabels[comment.collectionType]}
                      </span>
                    ) : null}
                    <time dateTime={new Date(comment.updatedAt * 1000).toISOString()}>
                      {commentDate(comment.updatedAt)}
                    </time>
                  </header>
                  <p>{comment.comment}</p>
                </div>
              </article>
            ))}
          </div>
          <footer className="bangumi-comments__foot">
            <span>
              已显示 {comments.length} / {total} 条{authored > 0 ? " · 包含你的吐槽" : ""}
            </span>
            {query.hasNextPage ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? <Loader2 size={13} className="detail-spin" /> : null}
                {query.isFetchingNextPage ? "正在读取…" : "加载更多"}
              </Button>
            ) : null}
          </footer>
        </>
      )}
    </section>
  );
}
