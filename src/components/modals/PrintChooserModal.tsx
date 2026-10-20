'use client';

import React, { useState } from 'react';
import { X, FileText, Layers, Check } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { useUiStore } from '@/store/useUiStore';
import { useSessionStore } from '@/store/useSessionStore';
import {
  executePrintWithOptions,
  startExportPdfWithOptions,
  executePrintTestSheet,
} from '@/lib/outputManager';

export function PrintChooserModal() {
  const printChooser = useUiStore((s) => s.printChooser);
  const closePrintChooser = useUiStore((s) => s.closePrintChooser);
  const jobs = useSessionStore((s) => s.jobs);
  const activeJobId = useSessionStore((s) => s.activeJobId);

  const [reverseBacks, setReverseBacks] = useState(false);

  if (!printChooser) return null;

  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  const firstBackPage = activeJob?.pages.find((p) => p.isBack);
  const flipMode = firstBackPage?.flipMode || 'sideways';
  const flipWord = flipMode === 'upward' ? 'upward' : 'sideways';

  const action = printChooser.action;
  const isTestSheet = action === 'testSheet';
  const isExport = action === 'export';

  const handlePrintFronts = () => {
    closePrintChooser();
    if (isTestSheet) {
      executePrintTestSheet('front');
    } else if (isExport) {
      startExportPdfWithOptions({ sideFilter: 'fronts' });
    } else {
      executePrintWithOptions({ sideFilter: 'fronts' });
    }
  };

  const handlePrintBacks = () => {
    closePrintChooser();
    if (isTestSheet) {
      executePrintTestSheet('back');
    } else if (isExport) {
      startExportPdfWithOptions({ sideFilter: 'backs', reverseBacks });
    } else {
      executePrintWithOptions({ sideFilter: 'backs', reverseBacks });
    }
  };

  const title = isTestSheet
    ? 'Alignment test sheet'
    : isExport
    ? 'Save as PDF'
    : 'Print';

  const frontLabel = isTestSheet
    ? 'Print test front'
    : isExport
    ? 'Save fronts as PDF'
    : 'Print fronts';

  const frontHint = isTestSheet
    ? 'Prints front calibration marks'
    : 'Outputs front sheets only in normal order';

  const backLabel = isTestSheet
    ? 'Print test back'
    : isExport
    ? 'Save backs as PDF'
    : 'Print backs';

  const backHint = isTestSheet
    ? 'Prints mirrored marks with nudge'
    : 'Outputs back sheets to align behind fronts';

  const flipInstruction = `Flip the sheets ${flipWord} and load them the same way. Print backs.`;

  return (
    <ModalShell
      titleId="print-chooser-title"
      onCancel={closePrintChooser}
      className="w-[min(520px,calc(100vw-32px))] bg-surface rounded-[24px] p-6 border border-line2 text-ink shadow-[0_32px_80px_-20px_rgba(0,0,0,0.65)] relative overflow-hidden focus:outline-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-line">
        <h2
          id="print-chooser-title"
          className="text-xl font-bold tracking-tight text-ink"
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={closePrintChooser}
          aria-label="Close"
          className="w-9 h-9 flex items-center justify-center rounded-[10px] text-muted hover:text-ink hover:bg-surface2 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Options */}
      <div className="flex flex-col gap-3 pt-5 pb-2">
        {/* Fronts Option */}
        <button
          type="button"
          onClick={handlePrintFronts}
          className="group w-full p-4 rounded-[16px] border-[1.5px] border-line bg-surface2 hover:border-blue hover:bg-blue-tint/30 transition-all text-left flex items-center gap-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
        >
          <div className="w-12 h-12 rounded-[12px] bg-blue/10 text-blue flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <FileText className="w-6 h-6" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-bold text-[16px] text-ink group-hover:text-blue transition-colors">
              {frontLabel}
            </span>
            <span className="text-xs text-muted mt-0.5">{frontHint}</span>
          </div>
        </button>

        {/* Backs Option */}
        <button
          type="button"
          onClick={handlePrintBacks}
          className="group w-full p-4 rounded-[16px] border-[1.5px] border-line bg-surface2 hover:border-blue hover:bg-blue-tint/30 transition-all text-left flex items-center gap-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
        >
          <div className="w-12 h-12 rounded-[12px] bg-red/10 text-red flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Layers className="w-6 h-6" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-bold text-[16px] text-ink group-hover:text-red transition-colors">
              {backLabel}
            </span>
            <span className="text-xs text-muted mt-0.5">{backHint}</span>
          </div>
        </button>
      </div>

      {/* Reversal toggle and flip instruction */}
      <div className="mt-3 pt-3 border-t border-line flex flex-col gap-2.5">
        {!isTestSheet && (
          <label className="flex items-center gap-2.5 text-xs font-medium text-ink cursor-pointer select-none">
            <input
              type="checkbox"
              checked={reverseBacks}
              onChange={(e) => setReverseBacks(e.target.checked)}
              className="w-4 h-4 rounded border-line text-blue focus:ring-blue"
            />
            <span>Backs in reverse order</span>
          </label>
        )}

        <div className="p-3 rounded-[12px] bg-surface2 text-xs text-muted border border-line flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue shrink-0" />
          <span>{flipInstruction}</span>
        </div>
      </div>
    </ModalShell>
  );
}
