import { ListChecks, Search } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../design-system/components/Button";
import { MergePanel } from "../metadata/MergePanel";
import { cn } from "../../lib/cn";
import type { LibraryItemDetail } from "../../lib/library-types";
import { MetadataPanel } from "./MetadataPanel";
import "./source-workspace.css";

type SourceMode = "merge" | "search";

const sourceTabs: { id: SourceMode; label: string; icon: typeof ListChecks }[] = [
  { id: "merge", label: "多源匹配", icon: ListChecks },
  { id: "search", label: "搜索导入", icon: Search },
];

interface SourceWorkspaceProps {
  detail: LibraryItemDetail;
  onChanged: () => void;
}

export function SourceWorkspace({ detail, onChanged }: SourceWorkspaceProps) {
  const [mode, setMode] = useState<SourceMode>("merge");

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % sourceTabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + sourceTabs.length) % sourceTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = sourceTabs.length - 1;
    }
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    const next = sourceTabs[nextIndex];
    if (!next) {
      return;
    }
    setMode(next.id);
    document.getElementById("source-tab-" + next.id)?.focus({ preventScroll: true });
  };

  return (
    <section className="source-workspace" aria-label="来源工具">
      <header className="source-workspace__head">
        <div className="source-workspace__tabs" role="tablist" aria-label="来源方式">
          {sourceTabs.map((entry, index) => {
            const Icon = entry.icon;
            const active = mode === entry.id;
            return (
              <button
                key={entry.id}
                id={"source-tab-" + entry.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={"source-panel-" + entry.id}
                tabIndex={active ? 0 : -1}
                className={cn(active && "is-active")}
                onClick={() => setMode(entry.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                <Icon size={14} strokeWidth={1.7} />
                {entry.label}
              </button>
            );
          })}
        </div>
        <Link to="/settings?focus=source-settings">
          <Button variant="secondary" size="sm">
            来源优先级
          </Button>
        </Link>
      </header>

      <div
        className="source-workspace__pane"
        id="source-panel-merge"
        role="tabpanel"
        aria-labelledby="source-tab-merge"
        hidden={mode !== "merge"}
      >
        <MergePanel detail={detail} onChanged={onChanged} embedded />
      </div>

      <div
        className="source-workspace__pane"
        id="source-panel-search"
        role="tabpanel"
        aria-labelledby="source-tab-search"
        hidden={mode !== "search"}
      >
        <MetadataPanel detail={detail} onChanged={onChanged} />
      </div>
    </section>
  );
}
