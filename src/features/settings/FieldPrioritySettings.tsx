import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { Tag } from "../../design-system/components/Tag";
import {
  listMetadataFieldPriorities,
  reorderMetadataFieldPriority,
  resetMetadataFieldPriority,
  setMetadataFieldPriorityGlobal,
} from "../../lib/library-api";
import type { FieldPriorityState } from "../../lib/library-types";
import { cn } from "../../lib/cn";

export function FieldPrioritySettings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["metadata-field-priorities"],
    queryFn: listMetadataFieldPriorities,
    staleTime: 5_000,
  });
  const [expanded, setExpanded] = useState<string | null>("title");
  const isGlobal = query.data?.[0]?.global ?? false;

  const updateCache = (next: FieldPriorityState[]) => {
    queryClient.setQueryData(["metadata-field-priorities"], next);
  };

  const move = async (field: FieldPriorityState, index: number, direction: -1 | 1) => {
    if (field.global) {
      return;
    }
    const target = index + direction;
    if (target < 0 || target >= field.providers.length) {
      return;
    }
    const nextProviders = [...field.providers];
    const first = nextProviders[index];
    const second = nextProviders[target];
    if (!first || !second) {
      return;
    }
    nextProviders[index] = second;
    nextProviders[target] = first;
    const next = (query.data ?? []).map((entry) =>
      entry.field === field.field
        ? {
            ...entry,
            custom: true,
            providers: nextProviders.map((provider, position) => ({
              ...provider,
              priority: (position + 1) * 10,
            })),
          }
        : entry,
    );
    updateCache(next);
    try {
      await reorderMetadataFieldPriority(
        field.field,
        nextProviders.map((provider) => provider.provider),
      );
      await queryClient.invalidateQueries({ queryKey: ["metadata-field-priorities"] });
      await queryClient.invalidateQueries({ queryKey: ["metadata-work-state"] });
    } catch (error) {
      toast.error(String(error));
      await queryClient.invalidateQueries({ queryKey: ["metadata-field-priorities"] });
    }
  };

  const reset = async (field: FieldPriorityState) => {
    try {
      await resetMetadataFieldPriority(field.field);
      await queryClient.invalidateQueries({ queryKey: ["metadata-field-priorities"] });
      await queryClient.invalidateQueries({ queryKey: ["metadata-work-state"] });
      toast.success(`${field.label}已恢复默认优先级`);
    } catch (error) {
      toast.error(String(error));
    }
  };

  const toggleGlobal = async () => {
    const enabled = !isGlobal;
    queryClient.setQueryData<FieldPriorityState[]>(["metadata-field-priorities"], (current) =>
      current?.map((entry) => ({
        ...entry,
        global: enabled,
      })),
    );
    try {
      await setMetadataFieldPriorityGlobal(enabled);
      await queryClient.invalidateQueries({ queryKey: ["metadata-field-priorities"] });
      await queryClient.invalidateQueries({ queryKey: ["metadata-work-state"] });
      toast.success(enabled ? "已切换为全局来源顺序" : "已恢复字段级优先级");
    } catch (error) {
      toast.error(String(error));
    }
  };

  return (
    <div className={cn("settings-field-priorities", isGlobal && "is-global")}>
      <div className="settings-field-priorities__head">
        <div>
          <b>字段优先级</b>
          <span>默认每个字段独立排序；打开全局开关后，所有字段都跟随上方“元数据来源”的顺序。</span>
        </div>
        <Tag tone={isGlobal ? "status" : "data"}>{isGlobal ? "全局顺序" : "字段级"}</Tag>
      </div>
      <label className="settings-field-priority-mode">
        <input
          type="checkbox"
          checked={isGlobal}
          aria-label="全部字段跟随全局来源顺序"
          onChange={() => void toggleGlobal()}
        />
        <span>
          <b>全部字段跟随全局来源顺序</b>
          <em>打开后，每个字段都使用上方来源列表的先后顺序；字段单独排序会保留，但暂时不生效。</em>
        </span>
        <Tag tone={isGlobal ? "status" : "muted"}>{isGlobal ? "已开启" : "已关闭"}</Tag>
      </label>
      {query.isPending ? (
        <div className="settings-source-loading">
          <Loader2 size={15} className="settings-spin" />
          正在读取字段优先级…
        </div>
      ) : query.isError ? (
        <div className="settings-source-loading settings-source-loading--error">
          {String(query.error)}
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
            重试
          </Button>
        </div>
      ) : (
        <div className="settings-field-priority-list">
          {(query.data ?? []).map((field) => {
            const open = expanded === field.field;
            const preferred = field.providers[0];
            return (
              <div className={cn("settings-field-priority", open && "is-open")} key={field.field}>
                <button
                  type="button"
                  className="settings-field-priority__summary"
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : field.field)}
                >
                  <span className="settings-field-priority__label">{field.label}</span>
                  <span className="settings-field-priority__preferred">
                    <em>首选</em>
                    <b>{preferred?.providerName ?? "未配置"}</b>
                  </span>
                  <span className="settings-field-priority__remaining">
                    {field.providers
                      .slice(1)
                      .map((provider) => provider.providerName)
                      .join(" → ") || "无其他来源"}
                  </span>
                  {field.global ? (
                    <Tag tone="status">全局</Tag>
                  ) : field.custom ? (
                    <Tag tone="data">已自定义</Tag>
                  ) : (
                    <Tag tone="muted">默认</Tag>
                  )}
                  <ChevronDown size={14} className="settings-field-priority__chevron" />
                </button>
                {open ? (
                  <div className="settings-field-priority__detail">
                    {field.providers.map((provider, index) => (
                      <div className="settings-field-priority__provider" key={provider.provider}>
                        <b>{String(index + 1).padStart(2, "0")}</b>
                        <span>{provider.providerName}</span>
                        <Tag tone={provider.enabled ? "status" : "muted"}>
                          {provider.enabled ? "启用" : "停用"}
                        </Tag>
                        <div className="settings-field-priority__actions">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`上移${field.label}的 ${provider.providerName}`}
                            disabled={field.global || index === 0}
                            onClick={() => void move(field, index, -1)}
                          >
                            <ArrowUp size={12} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`下移${field.label}的 ${provider.providerName}`}
                            disabled={field.global || index === field.providers.length - 1}
                            onClick={() => void move(field, index, 1)}
                          >
                            <ArrowDown size={12} />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="settings-field-priority__footer">
                      <span>
                        {field.global
                          ? "全局顺序模式已开启；关闭上方开关后可逐字段调整。"
                          : "顺序会立即保存，并影响之后的搜索、导入和批量刮削。"}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={field.global || !field.custom}
                        onClick={() => void reset(field)}
                      >
                        <RotateCcw size={12} /> 恢复默认
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
