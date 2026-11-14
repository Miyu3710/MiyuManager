import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("ds-empty", className)}>
      {icon ? <div className="ds-empty__icon">{icon}</div> : null}
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="ds-empty__action">{action}</div> : null}
    </div>
  );
}
