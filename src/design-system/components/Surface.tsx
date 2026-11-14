import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/cn";

type SurfaceTone = "panel" | "raised" | "soft" | "outline";

interface SurfaceProps extends ComponentPropsWithoutRef<"div"> {
  tone?: SurfaceTone;
}

export function Surface({ tone = "panel", className, ...props }: SurfaceProps) {
  return <div className={cn("ds-surface", `ds-surface--${tone}`, className)} {...props} />;
}
