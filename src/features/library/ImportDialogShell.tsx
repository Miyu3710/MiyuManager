import { X } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { createPortal } from "react-dom";
import { Hint } from "../../design-system/components/Hint";
import { cn } from "../../lib/cn";
import "./import-dialog.css";

interface ImportDialogFrameProps {
  title: string;
  titleId: string;
  description: ReactNode;
  closeLabel: string;
  onClose: () => void;
  busy?: boolean;
  dialogRef?: Ref<HTMLDivElement>;
  children: ReactNode;
  footerNote?: ReactNode;
  footerActions?: ReactNode;
  className?: string;
}

export function ImportDialogFrame({
  title,
  titleId,
  description,
  closeLabel,
  onClose,
  busy = false,
  dialogRef,
  children,
  footerNote,
  footerActions,
  className,
}: ImportDialogFrameProps) {
  return createPortal(
    <div
      className="import-overlay"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className={cn("import-dialog", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="import-dialog__head">
          <div className="import-dialog__copy">
            <h2 id={titleId}>{title}</h2>
            <p>{description}</p>
          </div>
          <button
            type="button"
            className="import-dialog__close"
            aria-label={closeLabel}
            disabled={busy}
            onClick={onClose}
          >
            <X size={16} strokeWidth={1.7} />
          </button>
        </header>

        <div className="import-dialog__body">{children}</div>

        {footerNote || footerActions ? (
          <footer className="import-dialog__foot">
            <p>{footerNote}</p>
            {footerActions ? <div className="import-dialog__actions">{footerActions}</div> : null}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function ImportSourceBar({
  label,
  value,
  badges,
}: {
  label: string;
  value: ReactNode;
  badges?: ReactNode;
}) {
  return (
    <div className="import-source">
      <div className="import-source__main">
        <span className="import-source__label">{label}</span>
        <Hint label={typeof value === "string" ? value : ""} side="bottom" align="start">
          <b className="import-source__value">{value}</b>
        </Hint>
      </div>
      {badges ? <div className="import-source__badges">{badges}</div> : null}
    </div>
  );
}

export function ImportSummary({
  children,
  tags,
  actions,
}: {
  children: ReactNode;
  tags?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="import-summary">
      <div className="import-summary__counts">{children}</div>
      {tags ? <div className="import-summary__tags">{tags}</div> : null}
      {actions ? <div className="import-summary__actions">{actions}</div> : null}
    </div>
  );
}

export function ImportCount({ value, label }: { value: ReactNode; label: string }) {
  return (
    <span className="import-count">
      <b>{value}</b>
      {label}
    </span>
  );
}

export function ImportProgress({
  icon,
  label,
  detail,
  percent,
  metrics,
  children,
}: {
  icon: ReactNode;
  label: string;
  detail: string;
  percent?: number;
  metrics: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="import-scan">
      <div className="import-scan__status">
        <span className="import-scan__mark" aria-hidden="true">
          {icon}
        </span>
        <div className="import-scan__copy">
          <b>{label}</b>
          <Hint label={detail} side="bottom" align="start">
            <span>{detail}</span>
          </Hint>
        </div>
      </div>
      <div
        className={cn("import-progress", percent === undefined && "is-indeterminate")}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <i style={percent === undefined ? undefined : { width: percent + "%" }} />
      </div>
      <div className="import-metrics">{metrics}</div>
      {children}
    </div>
  );
}

export function ImportMetric({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="import-metric">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function ImportNotice({
  tone = "error",
  children,
}: {
  tone?: "error" | "warning";
  children: ReactNode;
}) {
  return <div className={cn("import-notice", "is-" + tone)}>{children}</div>;
}

export function ImportEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="import-empty">
      <span className="import-empty__mark" aria-hidden="true">
        {icon}
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="import-empty__action">{action}</div> : null}
    </div>
  );
}
