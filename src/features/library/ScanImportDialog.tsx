import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "../../design-system/components/Button";
import { useDialogFocus } from "../../design-system/useDialogFocus";
import type { ImportCandidateInput } from "../../lib/library-types";
import { ScanReview } from "./ScanReview";
import { useScanSelection } from "./useScanSelection";
import type { ScanView } from "./useLibraryScan";
import {
  ImportDialogFrame,
  ImportEmpty,
  ImportMetric,
  ImportNotice,
  ImportProgress,
  ImportSourceBar,
} from "./ImportDialogShell";

interface ScanImportDialogProps {
  state: ScanView;
  importing: boolean;
  onCancel: () => void;
  onClose: () => void;
  onRetry: () => void;
  onPickAnother: () => void;
  onImport: (candidates: ImportCandidateInput[]) => void;
}

export function ScanImportDialog({
  state,
  importing,
  onCancel,
  onClose,
  onRetry,
  onPickAnother,
  onImport,
}: ScanImportDialogProps) {
  const selection = useScanSelection(state.status === "review" ? state.candidates : undefined);
  const dialogRef = useDialogFocus<HTMLDivElement>({
    open: state.status !== "idle",
    onEscape: () => {
      if (importing) {
        return;
      }
      if (state.status === "scanning") {
        onCancel();
      } else {
        onClose();
      }
    },
  });

  if (state.status === "idle") {
    return null;
  }

  const canImport = selection.canImport && !importing;
  const handleImport = () => onImport(selection.buildCandidates());

  const title =
    state.status === "scanning"
      ? "正在扫描目录"
      : state.status === "error"
        ? "扫描没有完成"
        : state.cancelled
          ? "扫描已取消"
          : "选择要入库的游戏";
  const description =
    state.status === "scanning"
      ? "读取目录、可执行文件名和大小；不会移动、修改或启动游戏文件。"
      : state.status === "error"
        ? "已选目录保留，可以重试或重新选择。"
        : state.cancelled
          ? "已保留扫描到的部分结果，导入前仍可逐项确认。"
          : "从扫描目录中读取可执行文件与安装大小，只读取，不改动游戏文件。";

  const footerNote =
    state.status === "scanning"
      ? "可以取消扫描，已发现的候选不会自动入库。"
      : state.status === "error"
        ? "扫描和导入都在本机完成。"
        : state.cancelled
          ? "扫描被取消，仍可导入已发现的候选。"
          : "导入只写入本地数据库和扫描路径，不改动游戏目录。";

  const footerActions =
    state.status === "scanning" ? (
      <Button variant="secondary" size="sm" disabled={state.cancelling} onClick={onCancel}>
        {state.cancelling ? "正在取消…" : "取消扫描"}
      </Button>
    ) : state.status === "review" ? (
      <>
        <Button variant="ghost" size="sm" disabled={importing} onClick={onPickAnother}>
          重新选择目录
        </Button>
        <Button variant="primary" size="sm" disabled={!canImport} onClick={handleImport}>
          {importing ? <Loader2 size={13} className="import-spin" /> : null}
          {importing ? "正在导入…" : "导入选中 " + selection.selectedGroups.length + " 部"}
        </Button>
      </>
    ) : (
      <Button variant="ghost" size="sm" onClick={onClose}>
        关闭
      </Button>
    );

  return (
    <ImportDialogFrame
      title={title}
      titleId="scan-dialog-title"
      description={description}
      closeLabel={state.status === "scanning" ? "取消扫描" : "关闭扫描窗口"}
      onClose={() => (state.status === "scanning" ? onCancel() : onClose())}
      busy={importing}
      dialogRef={dialogRef}
      footerNote={footerNote}
      footerActions={footerActions}
    >
      {state.status === "scanning" ? (
        <>
          <ImportSourceBar label="扫描目录" value={state.rootPath || "尚未选择目录"} />
          <ImportProgress
            icon={<Loader2 size={18} className="import-spin" />}
            label={state.cancelling ? "正在停止扫描…" : "正在读取目录"}
            detail={state.progress?.currentPath ?? state.rootPath}
            metrics={
              <>
                <ImportMetric value={state.progress?.scannedDirs ?? 0} label="已浏览目录" />
                <ImportMetric value={state.progress?.foundCandidates ?? 0} label="候选程序" />
                <ImportMetric
                  value={Math.round((state.progress?.elapsedMs ?? 0) / 1000) + "s"}
                  label="已用时"
                />
              </>
            }
          />
        </>
      ) : null}

      {state.status === "error" ? (
        <>
          <ImportNotice tone="error">
            <AlertTriangle size={14} />
            <span>{state.message}</span>
          </ImportNotice>
          <ImportEmpty
            icon={<AlertTriangle size={22} strokeWidth={1.5} />}
            title="无法完成扫描"
            description="检查目录是否可访问，或重新选择包含游戏主程序的文件夹。"
            action={
              state.rootPath ? (
                <Button variant="secondary" size="sm" onClick={onRetry}>
                  重试扫描
                </Button>
              ) : undefined
            }
          />
        </>
      ) : null}

      {state.status === "review" ? (
        <ScanReview state={state} selection={selection} importing={importing} />
      ) : null}
    </ImportDialogFrame>
  );
}
