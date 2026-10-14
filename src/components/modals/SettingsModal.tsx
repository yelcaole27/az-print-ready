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

  const jobs = useSessionStore((s) => s.jobs);
  const activeJobId = useSessionStore((s) => s.activeJobId);
  const setUnit = useSessionStore((s) => s.setUnit);
  const updateSettings = useSessionStore((s) => s.updateSettings);
  const clearElements = useSessionStore((s) => s.clearElements);
  const hasManualEdits = useSessionStore((s) => s.hasManualEdits);

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
    if (hasManualEdits(activeJob.id)) {
      const confirmed = window.confirm('Reset your manual changes?');
      if (!confirmed) {
        setMarginDraft(null);
        return;
      }
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
    if (hasManualEdits(activeJob.id)) {
      const confirmed = window.confirm('Reset your manual changes?');
      if (!confirmed) {
        setGapDraft(null);
        return;
      }
    }
    setGapDraft(null);
    updateSettings(activeJob.id, { gapMm: mm });
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
      className="w-[min(520px,92vw)] max-h-[86vh] flex flex-col bg-paper rounded-[16px] p-6 shadow-2xl border border-line text-ink relative overflow-hidden focus:outline-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-line shrink-0">
        <h2 id="settings-modal-title" className="text-[20px] font-semibold text-ink leading-tight">
          Settings
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="w-10 h-10 flex items-center justify-center rounded-[8px] text-muted hover:text-ink hover:bg-surface transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body: Scrollable sections */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-6 pr-1">
        {/* 1) Units */}
        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold text-muted uppercase tracking-wider">
            Units
          </h3>
          <div className="grid grid-cols-3 p-1 rounded-[8px] bg-surface border border-line text-[14px] font-medium">
            {(['mm', 'cm', 'in'] as Unit[]).map((u) => {
              const isSelected = currentUnit === u;
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`h-[40px] flex items-center justify-center rounded-[6px] transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-paper text-ink shadow-xs font-semibold'
                      : 'text-muted hover:text-ink'
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                >
                  {u}
                </button>
              );
            })}
          </div>
        </section>

        {/* 2) Space */}
        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold text-muted uppercase tracking-wider">
            Space
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[14px] font-medium text-ink">
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
                className="h-[40px] px-3 rounded-[8px] border border-line bg-surface text-ink text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue font-mono"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[14px] font-medium text-ink">
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
                className="h-[40px] px-3 rounded-[8px] border border-line bg-surface text-ink text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue font-mono"
              />
            </div>
          </div>
        </section>

        {/* 3) Cut lines */}
        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold text-muted uppercase tracking-wider">
            Cut lines
          </h3>
          <div className="grid grid-cols-3 p-1 rounded-[8px] bg-surface border border-line text-[14px] font-medium">
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
                  className={`h-[40px] flex items-center justify-center rounded-[6px] transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-paper text-ink shadow-xs font-semibold'
                      : 'text-muted hover:text-ink'
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {cutWarning && (
            <div className="flex items-start gap-2 text-[13px] text-muted mt-0.5">
              <span className="w-2 h-2 rounded-full bg-yellow shrink-0 mt-1" />
              <span>{cutWarning}</span>
            </div>
          )}
        </section>

        {/* 4) Text */}
        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold text-muted uppercase tracking-wider">
            Text
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                addTextBox();
                onClose();
              }}
              className="h-[40px] px-4 rounded-[8px] border border-line bg-surface hover:bg-surface/80 text-ink text-[14px] font-medium transition-colors cursor-pointer flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
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
              className="h-[40px] px-4 rounded-[8px] border border-line bg-surface hover:bg-surface/80 text-ink text-[14px] font-medium transition-colors cursor-pointer flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
            >
              <Type className="w-4 h-4" />
              <span>New text page</span>
            </button>
          </div>
        </section>

        {/* 5) Start over */}
        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold text-muted uppercase tracking-wider">
            Start over
          </h3>
          <button
            type="button"
            onClick={() => {
              const confirmed = window.confirm('Remove everything in this job?');
              if (confirmed) {
                clearElements(activeJob.id);
                clearSelection();
                onClose();
              }
            }}
            className="h-[40px] w-full flex items-center justify-center text-[14px] font-medium text-red border border-red/30 hover:bg-red/10 rounded-[8px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            Start over
          </button>
        </section>
      </div>
    </ModalShell>
  );
}
