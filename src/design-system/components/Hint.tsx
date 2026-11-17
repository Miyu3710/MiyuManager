import { Tooltip } from "radix-ui";
import {
  createContext,
  isValidElement,
  useContext,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "../../lib/cn";

const HintProviderContext = createContext(false);

export function HintProvider({ children }: { children: ReactNode }) {
  return (
    <HintProviderContext.Provider value>
      <Tooltip.Provider delayDuration={360} skipDelayDuration={240}>
        {children}
      </Tooltip.Provider>
    </HintProviderContext.Provider>
  );
}

interface HintProps {
  label: ReactNode;
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  className?: string;
  disabled?: boolean;
}

function isDisabledTrigger(child: ReactElement) {
  return isValidElement(child) && Boolean((child.props as { disabled?: boolean }).disabled);
}

function HintTooltip({
  label,
  children,
  side = "bottom",
  align = "center",
  sideOffset = 8,
  className,
}: HintProps) {
  if (!label) {
    return children;
  }

  const trigger = isDisabledTrigger(children) ? (
    <span className="ds-hint__anchor">{children}</span>
  ) : (
    children
  );

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{trigger}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className={cn("ds-tooltip", className)}
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={10}
          avoidCollisions
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Hint({ disabled, ...props }: HintProps) {
  const hasProvider = useContext(HintProviderContext);

  if (disabled) {
    return props.children;
  }

  if (!hasProvider) {
    return (
      <HintProvider>
        <HintTooltip {...props} />
      </HintProvider>
    );
  }

  return <HintTooltip {...props} />;
}
