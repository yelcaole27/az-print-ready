import React from 'react';

export interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom';
  className?: string;
}

export function Tooltip({
  content,
  children,
  position = 'bottom',
  className = '',
}: TooltipProps) {
  const positionClasses =
    position === 'top'
      ? 'bottom-full left-1/2 -translate-x-1/2 mb-1.5'
      : 'top-full left-1/2 -translate-x-1/2 mt-1.5';

  return (
    <div className={`relative group inline-flex ${className}`}>
      {children}
      <div
        role="tooltip"
        className={`absolute ${positionClasses} pointer-events-none hidden group-hover:block group-focus-within:block z-50 px-2 py-1 text-[11px] font-medium text-paper bg-ink rounded-[4px] shadow-sm whitespace-nowrap`}
      >
        {content}
      </div>
    </div>
  );
}
