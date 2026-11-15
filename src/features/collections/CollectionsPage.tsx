import { Dialog } from "radix-ui";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  FolderHeart,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { ConfirmDialog } from "../../design-system/components/ConfirmDialog";
import { CoverArt } from "../../design-system/components/CoverArt";
import { EmptyState } from "../../design-system/components/EmptyState";
import { Tag } from "../../design-system/components/Tag";
import {
  addCollectionWorks,
  assetUrl,
  createCollection,
  deleteCollection,
  libraryItemToGame,
  removeCollectionWork,
  renameCollection,
  reorderCollections,
} from "../../lib/library-api";
import type { CollectionSummary, LibraryItem } from "../../lib/library-types";
import { formatPlaytimeSeconds, formatRelativeDate } from "../../lib/format";
import { statusLabels } from "../../lib/game-data";
import { useLibraryInfinite } from "../library/useLibrary";
import { useCollectionItems, useCollections, useInvalidateCollections } from "./useCollections";
import "./collections.css";

function collectionVisual(collection: CollectionSummary) {
  const covers = collection.covers.map(assetUrl).filter((value): value is string => Boolean(value));
  if (covers.length > 0) {
    return (
      <div className="collection-card__stack">
        {covers.slice(0, 3).map((cover, index) => (
          <img src={cover} alt="" key={cover + index} />
        ))}
      </div>
    );
  }
  return (
    <span className="collection-card__empty" aria-hidden="true">
      <FolderHeart size={17} strokeWidth={1.5} />
    </span>
  );
}

function NameDialog({
  open,
  title,
  initial,
  busy,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial: string;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const nameRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="collection-dialog__overlay" />
        <Dialog.Content
          className="collection-dialog"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nameRef.current?.focus();
          }}
        >
          <Dialog.Title>{title}</Dialog.Title>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) {
                onSubmit(name);
              }
            }}
          >
            <label>
              收藏集名称
              <input
                ref={nameRef}
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.currentTarget.value)}
                placeholder="例如：夏天想重玩的作品"
              />
            </label>
            <div className="collection-dialog__actions">
              <Dialog.Close asChild>
                <Button variant="ghost" size="sm">
                  取消
                </Button>
              </Dialog.Close>
              <Button variant="primary" size="sm" type="submit" disabled={busy || !name.trim()}>
                {busy ? "保存中…" : "保存"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AddWorksDialog({
  open,
  collectionId,
  existingIds,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  collectionId: number;
  existingIds: Set<number>;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const library = useLibraryInfinite({ search: query, status: "all", sort: "added_desc" });
  const items = library.data?.pages.flatMap((page) => page.items) ?? [];
  const available = items.filter((item) => !existingIds.has(item.workId));

  const toggle = (workId: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(workId)) {
        next.delete(workId);
      } else {
        next.add(workId);
      }
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0) {
      return;
    }
    setBusy(true);
    try {
      const added = await addCollectionWorks(collectionId, [...selected]);
      toast.success(added > 0 ? "已加入 " + added + " 部作品" : "这些作品已经在收藏集中");
      onOpenChange(false);
      onAdded();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="collection-dialog__overlay" />
        <Dialog.Content
          className="collection-dialog collection-dialog--wide"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchRef.current?.focus();
          }}
        >
          <Dialog.Title>添加作品到收藏集</Dialog.Title>
          <Dialog.Description className="collection-dialog__description">
            从本地游戏库选择作品；已经在本收藏集中的作品不会重复出现。
          </Dialog.Description>
          <div className="collection-add__search">
            <Search size={15} strokeWidth={1.7} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="搜索作品、原题、开发商或标签"
              aria-label="搜索要加入收藏集的作品"
            />
            {query ? (
              <button type="button" aria-label="清空搜索" onClick={() => setQuery("")}>
                <X size={14} strokeWidth={1.8} />
              </button>
            ) : null}
          </div>
          <div className="collection-add__list" role="listbox" aria-label="可加入的作品">
            {library.isPending ? <p className="collection-add__hint">正在读取游戏库…</p> : null}
            {library.isError ? (
              <p className="collection-add__hint is-error">无法读取游戏库，请重试。</p>
            ) : null}
            {!library.isPending && available.length === 0 ? (
              <p className="collection-add__hint">没有可加入的作品。</p>
            ) : null}
            {available.map((item) => {
              const checked = selected.has(item.workId);
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={checked}
                  key={item.workId}
                  className={checked ? "collection-add__item is-selected" : "collection-add__item"}
                  onClick={() => toggle(item.workId)}
                >
                  <span className="collection-add__checkbox">
                    {checked ? <Check size={12} /> : null}
                  </span>
                  <span className="collection-add__cover">
                    <CoverArt work={libraryItemToGame(item)} />
                  </span>
                  <span className="collection-add__copy">
                    <b>{item.title}</b>
                    <small>
                      {[item.originalTitle, item.developer, statusLabels[item.status]]
                        .filter(Boolean)
                        .join("，")}
                    </small>
                  </span>
                  <Tag tone="muted">{formatPlaytimeSeconds(item.playtimeSeconds ?? 0)}</Tag>
                </button>
              );
            })}
            {library.hasNextPage ? (
              <Button
                variant="ghost"
                size="sm"
                className="collection-add__more"
                onClick={() => void library.fetchNextPage()}
                disabled={library.isFetchingNextPage}
              >
                {library.isFetchingNextPage ? "正在加载…" : "加载更多"}
              </Button>
            ) : null}
          </div>
          <div className="collection-dialog__actions">
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm">
                取消
              </Button>
            </Dialog.Close>
            <Button
              variant="primary"
              size="sm"
              disabled={busy || selected.size === 0}
              onClick={() => void submit()}
            >
              {busy ? "正在加入…" : "加入 " + selected.size + " 部作品"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CollectionWorkCard({
  item,
  onRemove,
}: {
  item: LibraryItem;
  onRemove: (item: LibraryItem) => void;
}) {
  return (
    <article className="collection-work">
      <Link to={"/work/" + item.workId} className="collection-work__art">
        <CoverArt work={libraryItemToGame(item)} />
      </Link>
      <div className="collection-work__body">
        <span className="home-card-status">{statusLabels[item.status]}</span>
        <Link to={"/work/" + item.workId} className="collection-work__title">
          {item.title}
        </Link>
        <p>{item.originalTitle || item.developer || "本地副本"}</p>
        <small>
          {formatPlaytimeSeconds(item.playtimeSeconds ?? 0)}，入库{" "}
          {formatRelativeDate(item.addedAt)}
        </small>
      </div>
      <button
        type="button"
        className="collection-work__remove"
        aria-label={"从收藏集移除 " + item.title}
        onClick={() => onRemove(item)}
      >
        <X size={14} strokeWidth={1.8} />
      </button>
    </article>
  );
}

export function CollectionsPage() {
  const params = useParams();
  const navigate = useNavigate();
  const collections = useCollections();
  const invalidate = useInvalidateCollections();
  const collectionId = params.id && Number.isInteger(Number(params.id)) ? Number(params.id) : null;
  const items = useCollectionItems(collectionId);
  const current = collections.data?.find((collection) => collection.id === collectionId);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sortBusy, setSortBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const allItems = useMemo(
    () => items.data?.pages.flatMap((page) => page.items) ?? [],
    [items.data?.pages],
  );

  const refresh = () => {
    invalidate();
  };

  const submitCreate = async (name: string) => {
    setBusy(true);
    try {
      const collection = await createCollection(name);
      setCreateOpen(false);
      refresh();
      toast.success("已创建收藏集「" + collection.name + "」");
      navigate("/collections/" + collection.id);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const submitRename = async (name: string) => {
    if (!current) {
      return;
    }
    setBusy(true);
    try {
      await renameCollection(current.id, name);
      setRenameOpen(false);
      refresh();
      toast.success("收藏集已重命名");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!current) {
      return;
    }
    setDeleting(true);
    try {
      await deleteCollection(current.id);
      setDeleteOpen(false);
      refresh();
      toast.success("已删除收藏集；作品本身仍保留在游戏库");
      navigate("/collections");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setDeleting(false);
    }
  };

  const moveCollection = async (index: number, direction: -1 | 1) => {
    const entries = collections.data ?? [];
    const target = index + direction;
    if (target < 0 || target >= entries.length) {
      return;
    }
    const next = [...entries];
    const [entry] = next.splice(index, 1);
    if (!entry) {
      return;
    }
    next.splice(target, 0, entry);
    setSortBusy(true);
    try {
      await reorderCollections(next.map((collection) => collection.id));
      refresh();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSortBusy(false);
    }
  };

  const removeWork = async (item: LibraryItem) => {
    if (!current) {
      return;
    }
    try {
      await removeCollectionWork(current.id, item.workId);
      refresh();
      toast.success("已从收藏集移除「" + item.title + "」");
    } catch (error) {
      toast.error(String(error));
    }
  };

  if (collectionId !== null && !current && collections.isPending) {
    return (
      <div className="collections-page">
        <div className="collections-skeleton" aria-busy="true" aria-label="正在读取收藏集" />
      </div>
    );
  }

  if (collectionId !== null && !current) {
    return (
      <div className="collections-page">
        <EmptyState
          title="收藏集不存在"
          description="它可能已经被删除。返回收藏集列表继续整理其他分组。"
          action={
            <Button variant="secondary" size="sm" onClick={() => navigate("/collections")}>
              返回收藏集
            </Button>
          }
        />
      </div>
    );
  }

  if (current) {
    return (
      <div className="collections-page">
        <header className="collections-head">
          <div>
            <Link to="/collections" className="collections-back">
              <ArrowLeft size={14} strokeWidth={1.7} /> 全部收藏集
            </Link>
            <h1>{current.name}</h1>
            <p>
              {current.workCount} 部作品，{formatRelativeDate(current.updatedAt)}更新
            </p>
          </div>
          <div className="collections-head__actions">
            <Button variant="ghost" size="sm" onClick={() => setRenameOpen(true)}>
              <Pencil size={13} strokeWidth={1.7} /> 重命名
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={13} strokeWidth={1.7} /> 删除
            </Button>
            <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
              <Plus size={14} strokeWidth={1.8} /> 添加作品
            </Button>
          </div>
        </header>

        {items.isError ? (
          <EmptyState
            title="无法读取收藏集作品"
            description={String(items.error)}
            action={
              <Button variant="secondary" size="sm" onClick={() => void items.refetch()}>
                重试
              </Button>
            }
          />
        ) : items.isPending ? (
          <div className="collections-skeleton" aria-busy="true" aria-label="正在读取收藏集作品" />
        ) : allItems.length === 0 ? (
          <EmptyState
            icon={<FolderHeart size={19} strokeWidth={1.5} />}
            title="这个收藏集还是空的"
            description="从游戏库选择作品加入这个分组。"
            action={
              <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
                <Plus size={14} strokeWidth={1.8} /> 添加作品
              </Button>
            }
          />
        ) : (
          <>
            <div className="collections-toolbar">
              <span>{allItems.length} 部作品</span>
              <button
                type="button"
                onClick={() => void items.fetchNextPage()}
                disabled={!items.hasNextPage || items.isFetchingNextPage}
              >
                {items.isFetchingNextPage ? "正在加载…" : "加载更多"}
              </button>
            </div>
            <section className="collection-works">
              {allItems.map((item) => (
                <CollectionWorkCard item={item} key={item.workId} onRemove={removeWork} />
              ))}
            </section>
          </>
        )}

        {renameOpen ? (
          <NameDialog
            open
            title="重命名收藏集"
            initial={current.name}
            busy={busy}
            onOpenChange={setRenameOpen}
            onSubmit={(name) => void submitRename(name)}
          />
        ) : null}
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={"删除收藏集「" + current.name + "」？"}
          description="只删除这个分组，作品、封面和游玩记录都不会从游戏库中删除。"
          confirmLabel="删除收藏集"
          busy={deleting}
          onConfirm={() => void confirmDelete()}
        />
        {addOpen ? (
          <AddWorksDialog
            open
            collectionId={current.id}
            existingIds={new Set(allItems.map((item) => item.workId))}
            onOpenChange={setAddOpen}
            onAdded={refresh}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="collections-page">
      <header className="collections-head">
        <div>
          <h1>收藏集</h1>
          <p>{(collections.data ?? []).length} 个分组，手动整理，不改动游戏库状态。</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} strokeWidth={1.8} /> 新建收藏集
        </Button>
      </header>

      {collections.isError ? (
        <EmptyState
          title="无法读取收藏集"
          description={String(collections.error)}
          action={
            <Button variant="secondary" size="sm" onClick={() => void collections.refetch()}>
              重试
            </Button>
          }
        />
      ) : collections.isPending ? (
        <div className="collections-skeleton" aria-busy="true" aria-label="正在读取收藏集" />
      ) : (collections.data ?? []).length === 0 ? (
        <EmptyState
          icon={<FolderHeart size={19} strokeWidth={1.5} />}
          title="建立第一个收藏集"
          description="按自己的理由把作品放在一起。"
          action={
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={14} strokeWidth={1.8} /> 新建收藏集
            </Button>
          }
        />
      ) : (
        <section className="collections-grid" aria-label="收藏集列表">
          {(collections.data ?? []).map((collection, index) => (
            <article className="collection-card" key={collection.id}>
              <Link to={"/collections/" + collection.id} className="collection-card__main">
                {collectionVisual(collection)}
                <div className="collection-card__copy">
                  <h2>{collection.name}</h2>
                  <p>{collection.workCount} 部作品</p>
                  <small>更新于 {formatRelativeDate(collection.updatedAt)}</small>
                </div>
              </Link>
              <div className="collection-card__actions">
                <button
                  type="button"
                  aria-label={"上移 " + collection.name}
                  disabled={index === 0 || sortBusy}
                  onClick={() => void moveCollection(index, -1)}
                >
                  <ArrowUp size={13} strokeWidth={1.7} />
                </button>
                <button
                  type="button"
                  aria-label={"下移 " + collection.name}
                  disabled={index === (collections.data ?? []).length - 1 || sortBusy}
                  onClick={() => void moveCollection(index, 1)}
                >
                  <ArrowDown size={13} strokeWidth={1.7} />
                </button>
              </div>
            </article>
          ))}
          <button
            type="button"
            className="collection-card collection-card--new"
            onClick={() => setCreateOpen(true)}
          >
            <span className="collection-card__new-mark" aria-hidden="true">
              <Plus size={20} strokeWidth={1.6} />
            </span>
            <span className="collection-card__new-copy">
              <b>新建收藏集</b>
              <small>按主题整理作品</small>
            </span>
          </button>
        </section>
      )}

      {createOpen ? (
        <NameDialog
          open
          title="新建收藏集"
          initial=""
          busy={busy}
          onOpenChange={setCreateOpen}
          onSubmit={(name) => void submitCreate(name)}
        />
      ) : null}
    </div>
  );
}
