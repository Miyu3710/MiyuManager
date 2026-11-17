import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  above?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, above, className }: PageHeaderProps) {
  return (
    <header className={cn("app-page-header", className)}>
      <div className="app-page-header__copy">
        {above}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="app-page-header__actions">{actions}</div> : null}
    </header>
  );
}
