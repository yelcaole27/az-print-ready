'use client';

import React from 'react';
import { useUiStore } from '@/store/useUiStore';

export interface ExportProgressProps {
  onCancel: () => void;
}

export function ExportProgress({ onCancel }: ExportProgressProps) {
  const { exportProgress } = useUiStore();

  if (!exportProgress) return null;

  const { done, total } = exportProgress;
  const percentage = Math.round((done / Math.max(1, total)) * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,6,9,0.62)] backdrop-blur-[3px] p-6 select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Exporting PDF"
    >
      <div className="w-[min(500px,calc(100vw-48px))] flex flex-col bg-surface rounded-[28px] px-[36px] pt-[32px] pb-[28px] border border-line2 text-ink shadow-[0_40px_100px_-20px_rgba(0,0,0,0.7)] gap-5">
        <div>
          <h2 className="font-heading font-extrabold text-[34px] tracking-[-0.02em] leading-tight text-ink">
            Making your{' '}
            <span className="font-accent italic text-[40px] text-red font-normal">
              PDF
            </span>
          </h2>
          <p className="text-[15px] text-muted mt-1">
            Page {done} of {total} ({percentage}%)
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full h-3 rounded-full bg-surface2 border border-line overflow-hidden p-0.5">
          <div
            className="h-full bg-blue rounded-full transition-all duration-200"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="flex items-center justify-end pt-2 border-t border-line">
          <button
            type="button"
            onClick={onCancel}
            className="h-[48px] px-6 rounded-[14px] border-[1.5px] border-line2 bg-transparent text-ink font-bold text-[16px] hover:border-blue hover:text-blue transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
