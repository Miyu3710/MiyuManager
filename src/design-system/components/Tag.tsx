import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/cn";

type TagTone = "neutral" | "accent" | "status" | "data" | "muted";

interface TagProps extends ComponentPropsWithoutRef<"span"> {
  tone?: TagTone;
}

export const Tag = forwardRef<HTMLSpanElement, TagProps>(function Tag(
  { tone = "neutral", className, ...props },
  ref,
) {
  return <span ref={ref} className={cn("ds-tag", `ds-tag--${tone}`, className)} {...props} />;
});
