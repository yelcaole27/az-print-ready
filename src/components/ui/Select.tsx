import React, { SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { label: string; value: string }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', options, disabled, value, onChange, ...props }, ref) => {
    return (
      <div className="relative inline-block">
        <select
          ref={ref}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={`h-8 pl-3 pr-8 text-xs font-medium bg-paper text-ink border border-line rounded-[8px] appearance-none cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-muted pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
      </div>
    );
  }
);

Select.displayName = 'Select';
