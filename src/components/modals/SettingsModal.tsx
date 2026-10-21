'use client';

import React, { useState, useEffect } from 'react';
import { X, Type, Minus, Plus, RotateCcw, Printer } from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { ModalShell } from './ModalShell';
import { Unit } from '@/types';
import { mmToUnit, unitToMm } from '@/lib/units';
import { computeCutGuides } from '@/lib/cutGuides';
import { addTextBox, newTextPage } from '@/lib/textActions';
import { getBackNudge, setBackNudge, resetBackNudge, type BackNudge } from '@/lib/backNudge';
import { PricesSettingsSection } from './PricesSettingsSection';

export function SettingsModal() {
  const isSettingsOpen = useUiStore((s) => s.isSettingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const settingsTab = useUiStore((s) => s.settingsTab);
  const setSettingsTab = useUiStore((s) => s.setSettingsTab);
  const openPrintChooser = useUiStore((s) => s.openPrintChooser);
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

  // Back alignment calibration nudge
  const [nudge, setNudge] = useState<BackNudge>({ xMm: 0, yMm: 0 });

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const generalTabRef = React.useRef<HTMLButtonElement>(null);
  const pricesTabRef = React.useRef<HTMLButtonElement>(null);

  const switchTab = (tab: 'general' | 'prices') => {
    setSettingsTab(tab);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [isSettingsOpen, settingsTab]);

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const currentTab = useUiStore.getState().settingsTab;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentTab !== 'prices') {
        switchTab('prices');
        pricesTabRef.current?.focus();
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentTab !== 'general') {
        switchTab('general');
        generalTabRef.current?.focus();
      }
    }
  };

  useEffect(() => {
    if (isSettingsOpen) {
      setNudge(getBackNudge());
    }
  }, [isSettingsOpen]);

  const handleNudgeChange = (axis: 'x' | 'y', delta: number) => {
    const currentVal = axis === 'x' ? nudge.xMm : nudge.yMm;
    const nextVal = Math.round((currentVal + delta) * 10) / 10;
    const updated = setBackNudge(
      axis === 'x' ? { xMm: nextVal } : { yMm: nextVal }
    );
    setNudge(updated);
  };

  const handleResetNudge = () => {
    const reset = resetBackNudge();
    setNudge(reset);
  };

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
      className="w-[min(580px,calc(100vw-48px))] h-[min(720px,calc(100vh-64px))] flex flex-col bg-surface rounded-[28px] px-[36px] pt-[32px] pb-[28px] border border-line2 text-ink shadow-[0_40px_100px_-20px_rgba(0,0,0,0.7)] relative overflow-hidden focus:outline-none"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 pb-5 border-b border-line shrink-0">
        <div className="flex items-start justify-between">
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

        {/* Big Tabs: General and Prices */}
        <div
          role="tablist"
          aria-label="Settings sections"
          className="grid grid-cols-2 p-1 bg-surface2 rounded-[14px] border border-line gap-1"
        >
          <button
            ref={generalTabRef}
            role="tab"
            id="tab-general"
            aria-controls="panel-general"
            aria-selected={settingsTab === 'general'}
            tabIndex={settingsTab === 'general' ? 0 : -1}
            type="button"
            onClick={() => switchTab('general')}
            onKeyDown={handleTabKeyDown}
            className={`h-[42px] flex items-center justify-center rounded-[10px] text-[14px] font-bold transition-all cursor-pointer ${
              settingsTab === 'general'
                ? 'bg-surface text-ink shadow-sm border border-line2'
                : 'text-muted hover:text-ink'
            } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
          >
            General
          </button>
          <button
            ref={pricesTabRef}
            role="tab"
            id="tab-prices"
            aria-controls="panel-prices"
            aria-selected={settingsTab === 'prices'}
            tabIndex={settingsTab === 'prices' ? 0 : -1}
            type="button"
            onClick={() => switchTab('prices')}
            onKeyDown={handleTabKeyDown}
            className={`h-[42px] flex items-center justify-center rounded-[10px] text-[14px] font-bold transition-all cursor-pointer ${
              settingsTab === 'prices'
                ? 'bg-surface text-ink shadow-sm border border-line2'
                : 'text-muted hover:text-ink'
            } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue`}
          >
            Prices
          </button>
        </div>
      </div>

      {/* Body: Scrollable sections */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto py-5 flex flex-col gap-6 pr-1"
      >
        {settingsTab === 'general' ? (
          <div
            role="tabpanel"
            id="panel-general"
            aria-labelledby="tab-general"
            className="flex flex-col gap-6"
          >
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

        {/* Back alignment */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-faint">
              Back alignment
            </h3>
            {(nudge.xMm !== 0 || nudge.yMm !== 0) && (
              <button
                type="button"
                onClick={handleResetNudge}
                className="text-xs text-blue hover:underline font-semibold cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Nudge sideways */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted">
                Nudge sideways (mm)
              </label>
              <div className="h-[44px] px-2 rounded-[14px] border-[1.5px] border-line bg-surface2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleNudgeChange('x', -0.1)}
                  disabled={nudge.xMm <= -5.0}
                  className="w-8 h-8 rounded-[10px] flex items-center justify-center text-muted hover:text-ink hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-colors"
                  aria-label="Decrease sideways nudge"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-mono text-[14px] font-bold text-ink">
                  {nudge.xMm > 0 ? `+${nudge.xMm.toFixed(1)}` : nudge.xMm.toFixed(1)}
                </span>
                <button
                  type="button"
                  onClick={() => handleNudgeChange('x', 0.1)}
                  disabled={nudge.xMm >= 5.0}
                  className="w-8 h-8 rounded-[10px] flex items-center justify-center text-muted hover:text-ink hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-colors"
                  aria-label="Increase sideways nudge"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Nudge up/down */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted">
                Nudge up/down (mm)
              </label>
              <div className="h-[44px] px-2 rounded-[14px] border-[1.5px] border-line bg-surface2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleNudgeChange('y', -0.1)}
                  disabled={nudge.yMm <= -5.0}
                  className="w-8 h-8 rounded-[10px] flex items-center justify-center text-muted hover:text-ink hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-colors"
                  aria-label="Decrease up/down nudge"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-mono text-[14px] font-bold text-ink">
                  {nudge.yMm > 0 ? `+${nudge.yMm.toFixed(1)}` : nudge.yMm.toFixed(1)}
                </span>
                <button
                  type="button"
                  onClick={() => handleNudgeChange('y', 0.1)}
                  disabled={nudge.yMm >= 5.0}
                  className="w-8 h-8 rounded-[10px] flex items-center justify-center text-muted hover:text-ink hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed transition-colors"
                  aria-label="Increase up/down nudge"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <p className="text-[13px] text-muted leading-relaxed">
            Print the test front, flip, print the test back, hold to the light. Move the nudge until the marks match.
          </p>

          <button
            type="button"
            onClick={() => {
              setSettingsOpen(false);
              openPrintChooser('testSheet');
            }}
            className="h-[44px] px-4 rounded-[14px] border-[1.5px] border-line bg-surface2 hover:border-blue hover:text-blue text-ink text-[14px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            <Printer className="w-4 h-4" />
            <span>Print test sheet</span>
          </button>
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
    ) : (
      <div
        role="tabpanel"
        id="panel-prices"
        aria-labelledby="tab-prices"
        className="flex flex-col gap-6"
      >
        <PricesSettingsSection />
      </div>
    )}
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
