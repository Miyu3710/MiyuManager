import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { cn } from "../../lib/cn";

export interface SettingsSelectOption {
  value: string;
  label: string;
  detail?: string;
}

interface SettingsSelectProps {
  value: string;
  options: SettingsSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  menuLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function SettingsSelect({
  value,
  options,
  onChange,
  ariaLabel,
  menuLabel,
  disabled,
  className,
}: SettingsSelectProps) {
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn("settings-select-trigger", className)}
          aria-label={ariaLabel + "：" + (selected?.label ?? "未选择")}
          disabled={disabled}
        >
          <span className="settings-select-trigger__value">
            <span className="settings-select-trigger__label">{selected?.label ?? "未选择"}</span>
            {selected?.detail ? (
              <span className="settings-select-trigger__detail">{selected.detail}</span>
            ) : null}
          </span>
          <ChevronDown
            className="settings-select-trigger__chevron"
            size={14}
            strokeWidth={1.7}
            aria-hidden="true"
          />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="settings-select-menu"
          aria-label={menuLabel ?? ariaLabel}
          align="end"
          sideOffset={8}
          collisionPadding={12}
        >
          {menuLabel ? <p className="settings-select-menu__head">{menuLabel}</p> : null}
          <DropdownMenu.RadioGroup value={value} onValueChange={onChange}>
            {options.map((option) => (
              <DropdownMenu.RadioItem
                key={option.value}
                value={option.value}
                className="settings-select-menu__item"
              >
                <span className="settings-select-menu__copy">
                  <span className="settings-select-menu__label">{option.label}</span>
                  {option.detail ? (
                    <span className="settings-select-menu__detail">{option.detail}</span>
                  ) : null}
                </span>
                <DropdownMenu.ItemIndicator className="settings-select-menu__check">
                  <Check size={13} strokeWidth={2} />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
