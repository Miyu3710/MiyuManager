import { Component, type ErrorInfo, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { AlertTriangle, FolderOpen, RefreshCw } from "lucide-react";
import { Button } from "../design-system/components/Button";
import { openLogDirectory } from "../lib/app-api";
import { reportError } from "./error-reporting";
import "./error-boundary.css";

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    reportError("render_error", error.message, error.stack, info.componentStack ?? undefined);
  }

  private reload = () => {
    window.location.reload();
  };

  private openLogs = () => {
    void openLogDirectory().catch(() => undefined);
  };

  override render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <main className="crash-fallback" role="alert">
        <div className="crash-fallback__mark">
          <AlertTriangle size={28} strokeWidth={1.5} />
        </div>
        <div className="crash-fallback__copy">
          <p className="crash-fallback__eyebrow">MIYU / RECOVERY</p>
          <h1>界面遇到问题</h1>
          <p>
            本地数据库和游戏文件没有被删除。重新载入界面通常可以继续使用；如果问题反复出现，请打开诊断日志。
          </p>
          <pre>{this.state.error.message}</pre>
        </div>
        <div className="crash-fallback__actions">
          <Button variant="primary" onClick={this.reload}>
            <RefreshCw size={15} strokeWidth={1.8} /> 重新载入
          </Button>
          {isTauri() ? (
            <Button variant="secondary" onClick={this.openLogs}>
              <FolderOpen size={15} strokeWidth={1.8} /> 打开诊断日志
            </Button>
          ) : null}
        </div>
      </main>
    );
  }
}
