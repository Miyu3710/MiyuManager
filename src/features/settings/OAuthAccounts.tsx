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
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { Tag } from "../../design-system/components/Tag";
import {
  connectOAuth,
  disconnectOAuth,
  getOAuthConfigInfo,
  importOAuthConfig,
  listOAuthAccounts,
} from "../../lib/library-api";

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

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["oauth-status"] }),
      queryClient.invalidateQueries({ queryKey: ["oauth-config"] }),
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

  const connect = async (providerId: string, name: string) => {
    setBusy(providerId);
    try {
      const status = await connectOAuth(providerId);
      const account = status.accountName ? `：${status.accountName}` : "";
      toast.success(`${name} 已连接${account}`);
      await refresh();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (providerId: string, name: string) => {
    setBusy(providerId);
    try {
      await disconnectOAuth(providerId);
      toast.success(`${name} 已断开`);
      await refresh();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="settings-oauth">
      <div className="settings-oauth__head">
        <div>
          <b>账号连接</b>
          <span>
            登录在系统浏览器中完成；MiyuManager 不接触密码。令牌使用 Windows DPAPI 加密保存，
            只用于你授权的账号数据。
          </span>
        </div>
        <div className="settings-oauth__tools">
          <Tag tone="data">
            <ShieldCheck size={11} /> OAuth 2.0
          </Tag>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            <RefreshCw size={13} /> 重新读取
          </Button>
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
          ) : null}
        </div>
      </div>

      {configQuery.data?.error ? (
        <div className="settings-oauth__notice settings-oauth__notice--warn">
          <AlertTriangle size={14} />
          <div>
            <b>没有读到 OAuth 配置</b>
            <p>{configQuery.data.error}</p>
            <p>
              当前数据目录：<code>{configQuery.data.dataDir}</code>
            </p>
          </div>
        </div>
      ) : configQuery.data?.path ? (
        <div className="settings-oauth__notice settings-oauth__notice--ok">
          <ShieldCheck size={14} />
          <div>
            <b>OAuth 配置已读取</b>
            <p>
              <code>{configQuery.data.path}</code>
            </p>
          </div>
        </div>
      ) : null}

      {query.isPending ? (
        <div className="settings-oauth__loading">
          <Loader2 size={15} className="settings-spin" /> 正在读取账号状态…
        </div>
      ) : query.isError ? (
        <div className="settings-oauth__loading settings-oauth__loading--error">
          {String(query.error)}
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
            <RefreshCw size={13} /> 重试
          </Button>
        </div>
      ) : (
        <div className="settings-oauth__list">
          {(query.data ?? []).map((provider) => (
            <div className="settings-oauth__row" key={provider.id}>
              <div className="settings-oauth__icon">
                <KeyRound size={15} strokeWidth={1.6} />
              </div>
              <div className="settings-oauth__main">
                <div className="settings-oauth__title">
                  <b>{provider.name}</b>
                  <span>{provider.description}</span>
                </div>
                <div className="settings-oauth__meta">
                  {provider.scopes.length > 0 ? (
                    provider.scopes.slice(0, 4).map((scope) => <span key={scope}>{scope}</span>)
                  ) : (
                    <span>登录后读取账号资料</span>
                  )}
                  {provider.scopes.length > 4 ? <span>+{provider.scopes.length - 4}</span> : null}
                </div>
                {!provider.connected &&
                provider.hint &&
                (provider.configured
                  ? provider.id === "hikarinagi"
                  : Boolean(configQuery.data?.path)) ? (
                  <p className="settings-oauth__hint">{provider.hint}</p>
                ) : null}
              </div>
              <div className="settings-oauth__state">
                {provider.connected ? (
                  <Tag tone="status">
                    已连接
                    {provider.accountName ? ` · ${provider.accountName}` : ""}
                  </Tag>
                ) : provider.configured ? (
                  <Tag tone="muted">未连接</Tag>
                ) : (
                  <Tag tone="muted">未配置</Tag>
                )}
              </div>
              <div className="settings-oauth__actions">
                {provider.connected ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === provider.id}
                    onClick={() => void disconnect(provider.id, provider.name)}
                  >
                    {busy === provider.id ? (
                      <Loader2 size={13} className="settings-spin" />
                    ) : (
                      <LogOut size={13} />
                    )}
                    断开
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!provider.configured || busy !== null}
                    onClick={() => void connect(provider.id, provider.name)}
                  >
                    {busy === provider.id ? (
                      <Loader2 size={13} className="settings-spin" />
                    ) : (
                      <KeyRound size={13} />
                    )}
                    {busy === provider.id ? "等待授权" : "连接"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="settings-oauth__note">
        连接后会打开系统浏览器。NextMoe / Kungal 和 Hikarinagi 使用 PKCE，不需要 client_secret；
        Bangumi 的 secret 只从本地 OAuth 配置读取，不会进入前端或日志。
      </p>
    </div>
  );
}
