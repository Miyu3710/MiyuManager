import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/cn";

const buttonVariants = cva("ds-button", {
  variants: {
    variant: {
      primary: "ds-button--primary",
      secondary: "ds-button--secondary",
      ghost: "ds-button--ghost",
      danger: "ds-button--danger",
    },
    size: {
      sm: "ds-button--sm",
      md: "ds-button--md",
      lg: "ds-button--lg",
    },
  },
  defaultVariants: {
    variant: "secondary",
    size: "md",
  },
});

export type ButtonProps = ComponentPropsWithoutRef<"button"> & VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});
