import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { Tag } from "../../design-system/components/Tag";
import {
  listMetadataProviders,
  reorderMetadataProviders,
  setMetadataProviderEnabled,
} from "../../lib/library-api";
import type { MetadataProvider } from "../../lib/library-types";

const fieldLabels: Record<string, string> = {
  title: "标题",
  original_title: "原题",
  aliases: "别名",
  description: "简介",
  year: "年份",
  tags: "标签",
  developer: "开发商",
  publisher: "发行商",
  release_date: "发行日期",
  cover: "封面",
  related: "关联作品",
};

function sortProviders(providers: MetadataProvider[]): MetadataProvider[] {
  return [...providers].sort(
    (left, right) => left.priority - right.priority || left.id.localeCompare(right.id),
  );
}

export function MetadataSourceSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["metadata-providers"],
    queryFn: listMetadataProviders,
    staleTime: 5_000,
  });
  const providers = sortProviders(query.data ?? []);

  const updateCache = (next: MetadataProvider[]) => {
    queryClient.setQueryData(["metadata-providers"], sortProviders(next));
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= providers.length) {
      return;
    }
    const next = [...providers];
    const first = next[index];
    const second = next[target];
    if (!first || !second) {
      return;
    }
    next[index] = second;
    next[target] = first;
    const reordered = next.map((provider, position) => ({
      ...provider,
      priority: (position + 1) * 10,
    }));
    updateCache(reordered);
    try {
      await reorderMetadataProviders(reordered.map((provider) => provider.id));
      await queryClient.invalidateQueries({ queryKey: ["metadata-providers"] });
      await queryClient.invalidateQueries({ queryKey: ["metadata-work-state"] });
    } catch (error) {
      toast.error(String(error));
      await queryClient.invalidateQueries({ queryKey: ["metadata-providers"] });
    }
  };

  const toggle = async (provider: MetadataProvider) => {
    const next = providers.map((entry) =>
      entry.id === provider.id ? { ...entry, enabled: !entry.enabled } : entry,
    );
    updateCache(next);
    try {
      await setMetadataProviderEnabled(provider.id, !provider.enabled);
      await queryClient.invalidateQueries({ queryKey: ["metadata-work-state"] });
    } catch (error) {
      toast.error(String(error));
      await queryClient.invalidateQueries({ queryKey: ["metadata-providers"] });
    }
  };

  return (
    <>
      <div className="settings-source-order">
        <div className="settings-source-order__head">
          <span>顺序</span>
          <span>来源</span>
          <span>提供字段</span>
          <span>状态</span>
          <span>调整</span>
        </div>
        {query.isPending ? (
          <div className="settings-source-loading">
            <Loader2 size={15} className="settings-spin" />
            正在读取来源…
          </div>
        ) : query.isError ? (
          <div className="settings-source-loading settings-source-loading--error">
            {String(query.error)}
            <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
              重试
            </Button>
          </div>
        ) : providers.length === 0 ? (
          <p className="settings-hint">还没有注册元数据来源。</p>
        ) : (
          providers.map((provider, index) => (
            <div className="settings-source-row" key={provider.id}>
              <b className="settings-source-priority">{String(index + 1).padStart(2, "0")}</b>
              <div className="settings-source-name">
                <b>{provider.name}</b>
                <span>{provider.description}</span>
              </div>
              <span className="settings-source-fields">
                {provider.fields
                  .slice(0, 5)
                  .map((field) => fieldLabels[field] ?? field)
                  .join(" / ")}
                {provider.fields.length > 5 ? ` +${provider.fields.length - 5}` : ""}
              </span>
              <div className="settings-source-state">
                <Tag tone={provider.enabled ? "status" : "muted"}>
                  {provider.enabled ? "启用" : "停用"}
                </Tag>
                {provider.requiresAuth ? (
                  <Tag tone={provider.connected ? "data" : "muted"}>
                    <KeyRound size={10} /> {provider.connected ? "已连接" : "待登录"}
                  </Tag>
                ) : (
                  <Tag tone="neutral">公开接口</Tag>
                )}
              </div>
              <div className="settings-source-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`上移 ${provider.name}`}
                  disabled={index === 0}
                  onClick={() => void move(index, -1)}
                >
                  <ArrowUp size={13} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`下移 ${provider.name}`}
                  disabled={index === providers.length - 1}
                  onClick={() => void move(index, 1)}
                >
                  <ArrowDown size={13} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void toggle(provider)}>
                  {provider.enabled ? "停用" : "启用"}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
      <p className="settings-hint">
        顺序决定搜索结果的排列和字段合并时的默认优先值。新增来源只需注册适配器，就会自动出现在这里。
      </p>
      <div className="settings-source-auth">
        <div>
          <b>账号连接</b>
          <span>
            Bangumi / Kungal / Hikarinagi 的 OAuth
            需要各站开发者应用凭证、回调地址和令牌存储；Provider 认证状态字段已预留， 当前 VNDB 与
            Bangumi 使用公开接口，不要求登录。
          </span>
        </div>
        <Tag tone="muted">
          <KeyRound size={11} /> 待接入
        </Tag>
      </div>
    </>
  );
}
