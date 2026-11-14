import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/cn";

type TagTone = "neutral" | "accent" | "status" | "data" | "muted";

interface TagProps extends ComponentPropsWithoutRef<"span"> {
  tone?: TagTone;
}

export function Tag({ tone = "neutral", className, ...props }: TagProps) {
  return <span className={cn("ds-tag", `ds-tag--${tone}`, className)} {...props} />;
}
