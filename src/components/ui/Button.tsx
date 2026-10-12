import React, { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost' | 'icon';
  size?: 'sm' | 'md';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'outline', size = 'sm', disabled, children, ...props }, ref) => {
    let variantStyles = 'bg-paper text-ink border border-line hover:bg-surface';
    if (variant === 'primary') {
      variantStyles = 'bg-red text-paper border border-transparent hover:brightness-95';
    } else if (variant === 'ghost') {
      variantStyles = 'bg-transparent text-muted hover:text-ink hover:bg-surface';
    } else if (variant === 'icon') {
      variantStyles = 'bg-transparent text-muted hover:text-ink hover:bg-surface p-1.5';
    }

    const sizeStyles =
      variant === 'icon'
        ? 'h-8 w-8 inline-flex items-center justify-center rounded-[8px]'
        : size === 'sm'
        ? 'h-8 px-3 text-xs inline-flex items-center justify-center gap-1.5 rounded-[8px] font-medium'
        : 'h-9 px-4 text-sm inline-flex items-center justify-center gap-2 rounded-[8px] font-medium';

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`${variantStyles} ${sizeStyles} transition-colors select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
