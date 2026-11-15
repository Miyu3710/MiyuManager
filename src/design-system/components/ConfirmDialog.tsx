import { AlertDialog } from "radix-ui";
import type { ReactNode } from "react";
import { Button } from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  tone = "danger",
  busy = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="ds-confirm__overlay" />
        <AlertDialog.Content className="ds-confirm">
          <p className="ds-confirm__kicker">需要确认</p>
          <AlertDialog.Title className="ds-confirm__title">{title}</AlertDialog.Title>
          <AlertDialog.Description className="ds-confirm__description">
            {description}
          </AlertDialog.Description>
          <div className="ds-confirm__actions">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost" size="sm" disabled={busy}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                variant={tone === "danger" ? "danger" : "primary"}
                size="sm"
                disabled={busy}
                onClick={(event) => {
                  event.preventDefault();
                  onConfirm();
                }}
              >
                {busy ? "处理中…" : confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
