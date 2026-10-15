'use client';

import React, { useEffect, useCallback } from 'react';
import { ArrowRight } from 'lucide-react';
import { useUiStore } from '@/store/useUiStore';

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,6,9,0.62)] backdrop-blur-[3px] p-6 select-none"
      onClick={onCancel}
    >
      <div
        className="w-[min(560px,calc(100vw-48px))] max-h-[90vh] flex flex-col bg-surface rounded-[28px] px-[36px] pt-[32px] pb-[28px] border border-line2 text-ink shadow-[0_40px_100px_-20px_rgba(0,0,0,0.7)] focus:outline-none"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="check-notice-title"
      >
        <div className="flex flex-col gap-1 mb-5">
          <h2
            id="check-notice-title"
            className="font-heading font-extrabold text-[34px] tracking-[-0.02em] leading-tight text-ink"
          >
            Check before{' '}
            <span className="font-accent italic text-[40px] text-red font-normal">
              {action === 'print' ? 'printing' : 'saving'}
            </span>
          </h2>
          <p className="text-[15px] text-muted mt-1">
            Potential issues were detected in your layout:
          </p>
        </div>

        <ul className="flex flex-col gap-2 py-2 max-h-60 overflow-y-auto">
          {displayLines.map((line, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2.5 p-3 rounded-[12px] bg-surface2 border border-line text-xs text-ink"
            >
              <span className="w-2 h-2 rounded-full bg-yellow shrink-0 mt-1" />
              <span className="leading-relaxed font-medium">{line}</span>
            </li>
          ))}
          {remainingCount > 0 && (
            <li className="text-xs text-muted pl-3.5 italic">
              and {remainingCount} more...
            </li>
          )}
        </ul>

        <div className="flex items-center justify-end gap-3 pt-5 mt-5 border-t border-line">
          <button
            type="button"
            onClick={onCancel}
            className="h-[48px] px-6 rounded-[14px] border-[1.5px] border-line2 bg-transparent text-ink font-bold text-[16px] hover:border-blue hover:text-blue transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-[48px] px-7 rounded-[14px] bg-red text-on-red font-bold text-[16px] flex items-center gap-2 hover:opacity-90 shadow-[0_8px_24px_-6px_rgba(244,112,103,0.55)] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            <span>{actionText}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
