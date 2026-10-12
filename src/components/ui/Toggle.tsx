import React from 'react';

export interface ToggleOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  title?: string;
}

export interface ToggleProps<T extends string = string> {
  options: ToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  disabled?: boolean;
}

export function Toggle<T extends string = string>({
  options,
  value,
  onChange,
  className = '',
  disabled = false,
}: ToggleProps<T>) {
  return (
    <div
      className={`inline-flex items-center h-8 bg-surface p-0.5 border border-line rounded-[8px] ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      } ${className}`}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.title}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`h-7 px-2.5 text-xs font-medium rounded-[6px] transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue ${
              isActive
                ? 'bg-paper text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
