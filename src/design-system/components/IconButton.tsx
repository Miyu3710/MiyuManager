import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/cn";

export const IconButton = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<"button">>(
  function IconButton({ className, type = "button", ...props }, ref) {
    return <button ref={ref} type={type} className={cn("ds-icon-button", className)} {...props} />;
  },
);
