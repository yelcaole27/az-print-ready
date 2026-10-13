'use client';

import React from 'react';
import { useUiStore } from '@/store/useUiStore';
import { Button } from '@/components/ui/Button';

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Exporting PDF"
    >
      <div className="bg-paper text-ink rounded-[12px] p-6 max-w-sm w-full shadow-lg border border-line flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold text-ink">
            Making your PDF...
          </h3>
          <p className="text-xs text-muted">
            Page {done} of {total} ({percentage}%)
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 rounded-full bg-surface border border-line overflow-hidden">
          <div
            className="h-full bg-blue transition-all duration-200"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="flex items-center justify-end pt-1">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
