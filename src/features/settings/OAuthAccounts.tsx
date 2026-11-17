import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  FileUp,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { ConfirmDialog } from "../../design-system/components/ConfirmDialog";
import { Hint } from "../../design-system/components/Hint";
import { Tag } from "../../design-system/components/Tag";
import { formatDate, formatRelativeDate } from "../../lib/format";
import {
  connectOAuth,
  disconnectOAuth,
  getOAuthConfigInfo,
  importOAuthConfig,
  listOAuthAccounts,
  syncOAuthProfile,
} from "../../lib/library-api";
import type { OAuthStatus } from "../../lib/library-types";
import { cn } from "../../lib/cn";

const scopeLabels: Record<string, string> = {
  openid: "身份",
  profile: "资料",
  offline_access: "离线访问",
  "catalog:read": "目录读取",
  "user:read": "账号状态",
};

function capabilityLabels(scopes: string[]): string[] {
  const labels = scopes
    .map((scope) => scopeLabels[scope] ?? scope)
    .filter((label, index, values) => label && values.indexOf(label) === index)
    .slice(0, 4);
  return labels.length > 0 ? labels : ["账号资料"];
}

function tokenExpiryLabel(expiresAt: number | null): string {
  if (!expiresAt) {
    return "未记录";
  }
  const remaining = expiresAt * 1000 - Date.now();
  if (remaining <= 0) {
    return "待刷新";
  }
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes < 60) {
    return `${minutes} 分钟后刷新`;
  }
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) {
    return `${hours} 小时后刷新`;
  }
  return `${Math.ceil(hours / 24)} 天后刷新`;
}

function AccountAvatar({ status }: { status: OAuthStatus }) {
  const [failed, setFailed] = useState(false);
  const name = (status.connected ? status.accountName : status.name)?.trim() ?? "";
  const label = Array.from(name)[0] ?? "M";

  return (
    <span className={cn("oauth-avatar", "is-" + status.id)}>
      {status.connected && status.avatarUrl && !failed ? (
        <img
          src={status.avatarUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <b>{label.toLocaleUpperCase()}</b>
      )}
    </span>
  );
}

const providerMarks: Record<string, string> = {
  bangumi: "/bangumi-icon.png",
  nextmoe: "/kungal-icon.png",
  hikarinagi: "/hikarinagi-icon.svg",
};

function ProviderMark({ status }: { status: OAuthStatus }) {
  const mark = providerMarks[status.id];
  return (
    <span className={cn("oauth-provider-mark", "is-" + status.id)} aria-hidden="true">
      {mark ? <img src={mark} alt="" /> : <b>{Array.from(status.name)[0]}</b>}
    </span>
  );
}

function AccountCard({
  status,
  busy,
  onConnect,
  onDisconnect,
  onSync,
}: {
  status: OAuthStatus;
  busy: string | null;
  onConnect: (status: OAuthStatus) => void;
  onDisconnect: (status: OAuthStatus) => void;
  onSync: (status: OAuthStatus) => void;
}) {
  const displayName = status.connected ? (status.accountName ?? status.name) : status.name;
  const capabilities = capabilityLabels(status.scopes);
  const providerBusy = busy === status.id;

  return (
    <article
      className={cn(
        "oauth-account-card",
        status.connected && "is-connected",
        !status.configured && "is-unconfigured",
      )}
      aria-busy={providerBusy}
    >
      <div className="oauth-account-card__lead">
        <ProviderMark status={status} />
        <AccountAvatar key={status.avatarUrl ?? status.id} status={status} />
      </div>
      <div className="oauth-account-card__identity">
        <div className="oauth-account-card__name-row">
          <b>{displayName}</b>
          <Tag tone={status.connected ? "status" : status.configured ? "muted" : "neutral"}>
            {status.connected ? "已连接" : status.configured ? "未连接" : "未配置"}
          </Tag>
        </div>
        <div className="oauth-account-card__provider-row">
          <Hint label={status.description} side="bottom" align="start">
            <span className="oauth-account-card__provider-name">{status.name}</span>
          </Hint>
          <span className="oauth-account-card__auth">
            {status.authKind === "oauth2_pkce" ? "PKCE" : "OAuth 2.0"}
          </span>
          {status.connected && status.accountId ? (
            <Hint
              label={status.connectedAt ? "连接于 " + formatDate(status.connectedAt) : ""}
              side="bottom"
              align="start"
            >
              <code>@{status.accountId}</code>
            </Hint>
          ) : null}
        </div>
      </div>

      <div className="oauth-account-card__body">
        <div className="oauth-capabilities" aria-label="平台能力">
          {capabilities.map((label) => (
            <Tag tone="neutral" key={label}>
              {label}
            </Tag>
          ))}
        </div>
        {status.connected ? (
          <div className="oauth-account-meta">
            <span>资料同步 · {formatRelativeDate(status.profileSyncedAt)}</span>
            <span>令牌 · {tokenExpiryLabel(status.expiresAt)}</span>
          </div>
        ) : (
          <p className="oauth-account-card__hint">
            {status.configured
              ? "连接后可以同步头像、用户名和账号状态。"
              : "先在配置区导入 providers.json，再连接这个平台。"}
          </p>
        )}
      </div>

      <div className="oauth-account-card__actions">
        {status.connected ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() => onSync(status)}
            >
              {providerBusy ? (
                <Loader2 size={13} className="settings-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              同步资料
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={() => onDisconnect(status)}
            >
              <LogOut size={13} /> 断开
            </Button>
          </>
        ) : status.configured ? (
          <Button
            variant="primary"
            size="sm"
            disabled={busy !== null}
            onClick={() => onConnect(status)}
          >
            {providerBusy ? (
              <Loader2 size={13} className="settings-spin" />
            ) : (
              <KeyRound size={13} />
            )}
            连接账号
          </Button>
        ) : (
          <Tag tone="muted">等待配置</Tag>
        )}
      </div>
    </article>
  );
}

export function OAuthAccounts() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["oauth-status"],
    queryFn: listOAuthAccounts,
    staleTime: 5_000,
  });
  const configQuery = useQuery({
    queryKey: ["oauth-config"],
    queryFn: getOAuthConfigInfo,
    staleTime: 5_000,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<OAuthStatus | null>(null);
  const statuses = query.data ?? [];
  const connected = statuses.filter((status) => status.connected);
  const latestSync = connected
    .map((status) => status.profileSyncedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const configError =
    configQuery.data?.error ?? (configQuery.isError ? String(configQuery.error) : null);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["oauth-status"] }),
      queryClient.invalidateQueries({ queryKey: ["oauth-config"] }),
      queryClient.invalidateQueries({ queryKey: ["metadata-providers"] }),
    ]);
  };

  const chooseConfig = async () => {
    setImporting(true);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        directory: false,
        title: "选择 OAuth providers.json",
        filters: [{ name: "OAuth 配置", extensions: ["json"] }],
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path) {
        return;
      }
      const info = await importOAuthConfig(path);
      toast.success(`OAuth 配置已导入，可使用 ${info.providerIds.length} 个来源`);
      await refresh();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setImporting(false);
    }
  };

  const connect = async (status: OAuthStatus) => {
    setBusy(status.id);
    try {
      const connectedStatus = await connectOAuth(status.id);
      await refresh();
      const account = connectedStatus.accountName ? `：${connectedStatus.accountName}` : "";
      toast.success(`${status.name} 已连接${account}`);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(null);
    }
  };

  const sync = async (status: OAuthStatus) => {
    setBusy(status.id);
    try {
      await syncOAuthProfile(status.id);
      await refresh();
      toast.success(`${status.name} 的账号资料已同步`);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(null);
    }
  };

  const syncAll = async () => {
    if (connected.length === 0) {
      return;
    }
    setBusy("all");
    try {
      const results = await Promise.allSettled(
        connected.map((status) => syncOAuthProfile(status.id)),
      );
      const failed = results.filter((result) => result.status === "rejected").length;
      await refresh();
      if (failed === 0) {
        toast.success(`已同步 ${connected.length} 个平台的账号资料`);
      } else if (failed === connected.length) {
        toast.error("账号资料同步失败，请检查网络或重新登录");
      } else {
        toast.warning(`同步完成，${failed} 个平台需要重新登录`);
      }
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (!disconnectTarget) {
      return;
    }
    setBusy(disconnectTarget.id);
    try {
      await disconnectOAuth(disconnectTarget.id);
      await refresh();
      toast.success(`${disconnectTarget.name} 已断开`);
      setDisconnectTarget(null);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="oauth-accounts">
      <div className="oauth-accounts__summary">
        <div className="oauth-accounts__summary-copy">
          <span className="oauth-accounts__summary-icon" aria-hidden="true">
            <UsersRound size={17} strokeWidth={1.7} />
          </span>
          <div>
            <b>
              {connected.length > 0 ? `${connected.length} 个平台已连接` : "还没有连接平台账号"}
            </b>
            <span>
              {latestSync
                ? `最近同步 ${formatRelativeDate(latestSync)}`
                : "连接后可同步头像、用户名与账号状态。"}
            </span>
          </div>
        </div>
        <div className="oauth-accounts__summary-actions">
          {connected.length > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() => void syncAll()}
            >
              {busy === "all" ? (
                <Loader2 size={13} className="settings-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              同步全部
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void refresh()}
          >
            <RefreshCw size={13} className={query.isFetching ? "settings-spin" : undefined} />
            重新读取
          </Button>
        </div>
      </div>

      <div className={cn("oauth-config-strip", configError && "is-warning")}>
        <span className="oauth-config-strip__icon" aria-hidden="true">
          {configQuery.isPending ? (
            <Loader2 size={16} className="settings-spin" />
          ) : configError ? (
            <AlertTriangle size={16} />
          ) : (
            <ShieldCheck size={16} />
          )}
        </span>
        <div className="oauth-config-strip__copy">
          <b>
            {configQuery.isPending
              ? "正在读取 OAuth 配置"
              : configError
                ? "OAuth 配置不可用"
                : "OAuth 配置已读取"}
          </b>
          <Hint label={configError ?? configQuery.data?.path ?? ""} side="bottom" align="start">
            <span>
              {configQuery.isPending
                ? "正在查找 providers.json…"
                : (configError ?? configQuery.data?.path ?? "未找到 providers.json")}
            </span>
          </Hint>
        </div>
        {isTauri() ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={importing}
            onClick={() => void chooseConfig()}
          >
            {importing ? <Loader2 size={13} className="settings-spin" /> : <FileUp size={13} />}
            导入配置
          </Button>
        ) : (
          <Tag tone="muted">浏览器预览</Tag>
        )}
      </div>

      {query.isPending ? (
        <div className="oauth-accounts__loading">
          <Loader2 size={15} className="settings-spin" /> 正在读取账号状态…
        </div>
      ) : query.isError ? (
        <div className="oauth-accounts__loading is-error">
          {String(query.error)}
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
            重试
          </Button>
        </div>
      ) : (
        <div className="oauth-account-grid">
          {statuses.map((status) => (
            <AccountCard
              key={status.id}
              status={status}
              busy={busy}
              onConnect={(item) => void connect(item)}
              onDisconnect={setDisconnectTarget}
              onSync={(item) => void sync(item)}
            />
          ))}
        </div>
      )}

      <p className="oauth-accounts__footnote">
        登录在系统浏览器中完成，令牌使用 Windows DPAPI
        加密保存；同步只读取账号资料，不会上传本地库。
      </p>

      <ConfirmDialog
        open={disconnectTarget !== null}
        onOpenChange={(open) => !open && setDisconnectTarget(null)}
        title={`断开 ${disconnectTarget?.name ?? "平台账号"}？`}
        description="本地保存的访问令牌会一并删除；需要时可以重新连接。"
        confirmLabel="断开账号"
        busy={busy === disconnectTarget?.id}
        onConfirm={() => void disconnect()}
      />
    </div>
  );
}
