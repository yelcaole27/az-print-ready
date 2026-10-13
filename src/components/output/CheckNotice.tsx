'use client';

import React, { useEffect, useCallback } from 'react';
import { useUiStore } from '@/store/useUiStore';
import { Button } from '@/components/ui/Button';

export interface CheckNoticeProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function CheckNotice({ onConfirm, onCancel }: CheckNoticeProps) {
  const { checkNotice } = useUiStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [onCancel]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!checkNotice) return null;

  const { action, lines } = checkNotice;
  const maxShown = 5;
  const displayLines = lines.slice(0, maxShown);
  const remainingCount = lines.length - maxShown;

  const actionText = action === 'print' ? 'Print anyway' : 'Save anyway';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 select-none"
      onClick={onCancel}
    >
      <div
        className="bg-paper text-ink rounded-[12px] p-6 max-w-md w-full shadow-lg border border-line flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="check-notice-title"
      >
        <div className="flex flex-col gap-1">
          <h3 id="check-notice-title" className="text-sm font-semibold text-ink">
            Check before {action === 'print' ? 'printing' : 'saving'}
          </h3>
          <p className="text-xs text-muted">
            The following potential issues were detected in your layout:
          </p>
        </div>

        <ul className="flex flex-col gap-2 py-1 max-h-60 overflow-y-auto">
          {displayLines.map((line, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs text-ink">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow shrink-0 mt-1.5" />
              <span className="leading-relaxed">{line}</span>
            </li>
          ))}
          {remainingCount > 0 && (
            <li className="text-xs text-muted pl-3.5 italic">
              and {remainingCount} more...
            </li>
          )}
        </ul>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
          <Button variant="outline" onClick={onCancel}>
            Go back
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            {actionText}
          </Button>
        </div>
      </div>
    </div>
  );
}
