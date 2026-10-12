'use client';

import React from 'react';
import {
  Undo2,
  Redo2,
  RectangleVertical,
  RectangleHorizontal,
  Sun,
  Monitor,
  Moon,
} from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore, AppTheme } from '@/store/useUiStore';
import { PAPERS } from '@/lib/constants/papers';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { Tooltip } from '@/components/ui/Tooltip';
import { Unit } from '@/types';

export function TopBar() {
  const {
    jobs,
    activeJobId,
    renameJob,
    setJobPaper,
    setJobOrientation,
    setUnit,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useSessionStore();

  const { theme, setTheme } = useUiStore();

  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  const firstPage = activeJob?.pages[0];
  const currentUnit = activeJob?.settings.unit || 'in';

  const hasUndo = canUndo(activeJobId);
  const hasRedo = canRedo(activeJobId);

  const paperOptions = PAPERS.map((p) => ({
    value: p.id,
    label: p.name,
  }));

  const orientationOptions = [
    {
      value: 'portrait' as const,
      label: <RectangleVertical className="w-3.5 h-3.5" />,
      title: 'Portrait',
    },
    {
      value: 'landscape' as const,
      label: <RectangleHorizontal className="w-3.5 h-3.5" />,
      title: 'Landscape',
    },
  ];

  const unitOptions = [
    { value: 'mm' as Unit, label: 'mm' },
    { value: 'cm' as Unit, label: 'cm' },
    { value: 'in' as Unit, label: 'in' },
  ];

  const themeOptions: { value: AppTheme; label: React.ReactNode; tooltip: string }[] = [
    { value: 'light', label: <Sun className="w-3.5 h-3.5" />, tooltip: 'Light' },
    { value: 'system', label: <Monitor className="w-3.5 h-3.5" />, tooltip: 'System' },
    { value: 'dark', label: <Moon className="w-3.5 h-3.5" />, tooltip: 'Dark' },
  ];

  return (
    <header className="h-14 bg-paper border-b border-line px-4 flex items-center justify-between shrink-0 select-none">
      {/* Left: Logo */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red" />
          <span className="w-2 h-2 rounded-full bg-blue" />
          <span className="w-2 h-2 rounded-full bg-green" />
          <span className="w-2 h-2 rounded-full bg-yellow" />
        </div>
        <span className="font-semibold text-sm text-ink tracking-tight">
          AZ Print Ready
        </span>
      </div>

      {/* Center: Inline editable job name */}
      <div className="flex items-center justify-center flex-1 max-w-xs px-2">
        {activeJob && (
          <input
            type="text"
            value={activeJob.name}
            onChange={(e) => renameJob(activeJob.id, e.target.value)}
            className="w-full text-center text-xs font-medium text-ink bg-transparent hover:bg-surface focus:bg-paper border border-transparent hover:border-line focus:border-line rounded-[6px] px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue"
            aria-label="Job name"
            title="Click to rename job"
          />
        )}
      </div>

      {/* Right: Controls & actions */}
      <div className="flex items-center gap-2">
        {/* Theme Segmented Toggle */}
        <div className="inline-flex items-center h-8 bg-surface p-0.5 border border-line rounded-[8px]">
          {themeOptions.map((opt) => {
            const isActive = theme === opt.value;
            return (
              <Tooltip key={opt.value} content={opt.tooltip}>
                <button
                  type="button"
                  onClick={() => setTheme(opt.value)}
                  aria-label={opt.tooltip}
                  className={`h-7 w-7 flex items-center justify-center rounded-[6px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue ${
                    isActive
                      ? 'bg-paper text-blue shadow-xs font-semibold'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  {opt.label}
                </button>
              </Tooltip>
            );
          })}
        </div>

        {firstPage && (
          <>
            <Select
              options={paperOptions}
              value={firstPage.paperId}
              onChange={(e) => setJobPaper(activeJob.id, e.target.value)}
              aria-label="Select paper size for job"
            />

            <Toggle
              options={orientationOptions}
              value={firstPage.orientation}
              onChange={(val) => setJobOrientation(activeJob.id, val)}
              aria-label="Select orientation for job"
            />
          </>
        )}

        <Toggle
          options={unitOptions}
          value={currentUnit}
          onChange={(val) => setUnit(val)}
          aria-label="Select measurement unit"
        />

        <div className="h-4 w-[1px] bg-line mx-1" />

        {/* Active Undo / Redo Actions */}
        <Tooltip content="Undo (Ctrl+Z)">
          <Button
            variant="icon"
            disabled={!hasUndo}
            onClick={() => undo(activeJobId)}
            aria-label="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </Button>
        </Tooltip>

        <Tooltip content="Redo (Ctrl+Y)">
          <Button
            variant="icon"
            disabled={!hasRedo}
            onClick={() => redo(activeJobId)}
            aria-label="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </Button>
        </Tooltip>

        <Button variant="outline" disabled>
          Print
        </Button>

        <Button variant="primary" disabled>
          Export PDF
        </Button>
      </div>
    </header>
  );
}
