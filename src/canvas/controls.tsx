import { useId } from "react";

import { Tabs, TabsItem } from "@/components/ui/tabs";

export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-caption text-text-secondary">{label}</span>
      <Tabs
        size="compact"
        aria-label={label}
        idPrefix={id}
        selectedIndex={Math.max(
          0,
          options.findIndex((option) => option.value === value),
        )}
        onSelect={(index) => {
          const next = options[index];
          if (next) onChange(next.value);
        }}
      >
        {options.map((option, index) => (
          <TabsItem key={option.value} index={index} label={option.label} />
        ))}
      </Tabs>
    </div>
  );
}
