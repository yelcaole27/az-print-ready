'use client';

import React, { useState } from 'react';
import { X, Type } from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { ModalShell } from './ModalShell';
import { Unit } from '@/types';
import { mmToUnit, unitToMm } from '@/lib/units';
import { computeCutGuides } from '@/lib/cutGuides';
import { addTextBox, newTextPage } from '@/lib/textActions';

export function SettingsModal() {
  const isSettingsOpen = useUiStore((s) => s.isSettingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const activePageId = useUiStore((s) => s.activePageId);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const openConfirmModal = useUiStore((s) => s.openConfirmModal);

  const jobs = useSessionStore((s) => s.jobs);
  const activeJobId = useSessionStore((s) => s.activeJobId);
  const setUnit = useSessionStore((s) => s.setUnit);
  const updateSettings = useSessionStore((s) => s.updateSettings);
  const clearElements = useSessionStore((s) => s.clearElements);

  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  const currentUnit = activeJob?.settings.unit || 'in';

  // Draft state for space inputs
  const [marginDraft, setMarginDraft] = useState<string | null>(null);
  const [gapDraft, setGapDraft] = useState<string | null>(null);

  if (!isSettingsOpen || !activeJob) {
    return null;
  }

  const onClose = () => {
    setSettingsOpen(false);
  };

  const marginInUnit = Math.round(mmToUnit(activeJob.settings.marginMm, currentUnit) * 100) / 100;
  const gapInUnit = Math.round(mmToUnit(activeJob.settings.gapMm, currentUnit) * 100) / 100;

  const displayMargin = marginDraft ?? String(marginInUnit);
  const displayGap = gapDraft ?? String(gapInUnit);

  const commitMargin = () => {
    if (marginDraft === null) return;
    const val = parseFloat(marginDraft);
    if (isNaN(val)) {
      setMarginDraft(null);
      return;
    }
    const mm = Math.min(50, Math.max(0, unitToMm(val, currentUnit)));
    if (Math.abs(mm - activeJob.settings.marginMm) < 0.001) {
      setMarginDraft(null);
      return;
    }
    setMarginDraft(null);
    updateSettings(activeJob.id, { marginMm: mm });
  };

  const commitGap = () => {
    if (gapDraft === null) return;
    const val = parseFloat(gapDraft);
    if (isNaN(val)) {
      setGapDraft(null);
      return;
    }
    const mm = Math.min(20, Math.max(0, unitToMm(val, currentUnit)));
    if (Math.abs(mm - activeJob.settings.gapMm) < 0.001) {
      setGapDraft(null);
      return;
    }
    setGapDraft(null);
    updateSettings(activeJob.id, { gapMm: mm });
  };

  const handleStartOver = () => {
    openConfirmModal({
      title: 'Start',
      accentWord: 'over?',
      message: 'This will remove all pictures and text from this job.',
      confirmLabel: 'Remove everything',
      destructive: true,
      onConfirm: () => {
        clearElements(activeJob.id);
        clearSelection();
        onClose();
      },
    });
  };

  const activePage =
    activeJob.pages.find((p) => p.id === activePageId) || activeJob.pages[0];
  const cutWarning =
    (activeJob.settings.cutStyle ?? 'none') === 'ticks' && activePage
      ? computeCutGuides(activePage, activeJob.settings).warning
      : null;

  return (
    <ModalShell
      titleId="settings-modal-title"
      onCancel={onClose}
      className="w-[min(580px,calc(100vw-48px))] max-h-[90vh] flex flex-col bg-surface rounded-[28px] px-[36px] pt-[32px] pb-[28px] border border-line2 text-ink shadow-[0_40px_100px_-20px_rgba(0,0,0,0.7)] relative overflow-hidden focus:outline-none"
    >
      {/* Header */}
      <div className="flex items-start justify-between pb-5 border-b border-line shrink-0">
        <div className="flex flex-col gap-1">
          <h2
            id="settings-modal-title"
            className="font-heading font-extrabold text-[34px] tracking-[-0.02em] text-ink leading-tight"
          >
            Project{' '}
            <span className="font-accent italic text-[40px] text-red font-normal">
              settings
            </span>
          </h2>
          <p className="text-[15px] text-muted">
            Margins, spacing, units, and page tools.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="w-10 h-10 flex items-center justify-center rounded-[12px] text-muted hover:text-ink hover:bg-surface2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body: Scrollable sections */}
      <div className="flex-1 overflow-y-auto py-5 flex flex-col gap-6 pr-1">
        {/* 1) Units */}
        <section className="flex flex-col">
          <h3 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-faint mb-2.5">
            Units
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {(['mm', 'cm', 'in'] as Unit[]).map((u) => {
              const isSelected = currentUnit === u;
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`h-[44px] flex items-center justify-center rounded-[14px] border-[1.5px] text-[14px] font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'border-blue bg-blueTint text-blue'
                      : 'border-line bg-surface2 text-muted hover:text-ink hover:border-line2'
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                >
                  {u}
                </button>
              );
            })}
          </div>
        </section>

        {/* 2) Space */}
        <section className="flex flex-col">
          <h3 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-faint mb-2.5">
            Space
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted">
                Space around ({currentUnit})
              </label>
              <input
                type="number"
                step="any"
                min={0}
                value={displayMargin}
                onChange={(e) => setMarginDraft(e.target.value)}
                onBlur={commitMargin}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                className="h-[44px] px-3.5 rounded-[14px] border-[1.5px] border-line bg-surface2 text-ink text-[15px] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted">
                Space between ({currentUnit})
              </label>
              <input
                type="number"
                step="any"
                min={0}
                value={displayGap}
                onChange={(e) => setGapDraft(e.target.value)}
                onBlur={commitGap}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                className="h-[44px] px-3.5 rounded-[14px] border-[1.5px] border-line bg-surface2 text-ink text-[15px] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              />
            </div>
          </div>
        </section>

        {/* 3) Cut lines */}
        <section className="flex flex-col">
          <h3 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-faint mb-2.5">
            Cut lines
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {[
              { style: 'none' as const, label: 'None' },
              { style: 'ticks' as const, label: 'Marks' },
              { style: 'outline' as const, label: 'Lines' },
            ].map(({ style, label }) => {
              const isSelected = (activeJob.settings.cutStyle ?? 'none') === style;
              return (
                <button
                  key={style}
                  type="button"
                  onClick={() => updateSettings(activeJob.id, { cutStyle: style })}
                  className={`h-[44px] flex items-center justify-center rounded-[14px] border-[1.5px] text-[14px] font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'border-blue bg-blueTint text-blue'
                      : 'border-line bg-surface2 text-muted hover:text-ink hover:border-line2'
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {cutWarning && (
            <div className="flex items-start gap-2 text-[13px] text-muted mt-2">
              <span className="w-2 h-2 rounded-full bg-yellow shrink-0 mt-1" />
              <span>{cutWarning}</span>
            </div>
          )}
        </section>

        {/* 4) Text */}
        <section className="flex flex-col">
          <h3 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-faint mb-2.5">
            Text
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                addTextBox();
                onClose();
              }}
              className="h-[44px] px-4 rounded-[14px] border-[1.5px] border-line bg-surface2 hover:bg-line/40 text-ink text-[14px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
            >
              <Type className="w-4 h-4" />
              <span>Add text box</span>
            </button>
            <button
              type="button"
              onClick={() => {
                newTextPage();
                onClose();
              }}
              className="h-[44px] px-4 rounded-[14px] border-[1.5px] border-line bg-surface2 hover:bg-line/40 text-ink text-[14px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
            >
              <Type className="w-4 h-4" />
              <span>New text page</span>
            </button>
          </div>
        </section>

        {/* 5) Start over */}
        <section className="flex flex-col">
          <h3 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-faint mb-2.5">
            Start over
          </h3>
          <button
            type="button"
            onClick={handleStartOver}
            className="h-[48px] w-full flex items-center justify-center text-[15px] font-bold text-red bg-red/10 border-[1.5px] border-red/30 hover:bg-red/20 rounded-[14px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            Remove everything in this job
          </button>
        </section>
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-line flex items-center justify-end shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="h-[48px] px-8 rounded-[14px] border-[1.5px] border-line2 bg-surface2 hover:bg-line text-ink font-bold text-[16px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
        >
          Done
        </button>
      </div>
    </ModalShell>
  );
}
