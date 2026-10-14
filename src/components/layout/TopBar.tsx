'use client';

import React, { useState, useRef } from 'react';
import { Undo2, Redo2, Moon, Sun, Settings } from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { Tooltip } from '@/components/ui/Tooltip';
import { requestPrint, requestExportPdf } from '@/lib/outputManager';

export function TopBar() {
  const { jobs, activeJobId, renameJob, undo, redo, canUndo, canRedo } = useSessionStore();
  const { toggleTheme, setSettingsOpen } = useUiStore();

  const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
  const hasUndo = canUndo(activeJobId);
  const hasRedo = canRedo(activeJobId);

  // Check if active job has any elements (Start screen vs workspace)
  const isStartScreen = !activeJob?.pages.some((p) => p.elements.length > 0);

  // Editable job name state
  const activeJobName = activeJob?.name || '';
  const [jobNameInput, setJobNameInput] = useState(activeJobName);
  const [prevJobName, setPrevJobName] = useState(activeJobName);
  const inputRef = useRef<HTMLInputElement>(null);

  if (activeJobName !== prevJobName) {
    setPrevJobName(activeJobName);
    setJobNameInput(activeJobName);
  }

  const handleCommitName = () => {
    if (!activeJob) return;
    const trimmed = jobNameInput.trim();
    if (trimmed && trimmed !== activeJob.name) {
      renameJob(activeJob.id, trimmed);
    } else {
      setJobNameInput(activeJob.name);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setJobNameInput(activeJob?.name || '');
      e.currentTarget.blur();
    }
  };

  return (
    <header className="h-14 bg-bar text-white px-4 flex items-center justify-between shrink-0 select-none z-30">
      {/* Left: Brand Title */}
      <div className="flex items-center">
        <span className="font-semibold text-[14px] uppercase tracking-[0.08em] text-white">
          AZ PRINTING READY
        </span>
      </div>

      {/* Center: Inline editable job name */}
      <div className="flex items-center justify-center flex-1 max-w-sm px-2">
        {activeJob && (
          <input
            ref={inputRef}
            type="text"
            maxLength={40}
            value={jobNameInput}
            onChange={(e) => setJobNameInput(e.target.value)}
            onBlur={handleCommitName}
            onKeyDown={handleKeyDown}
            placeholder="Untitled job"
            className="w-full text-center text-[16px] font-semibold text-white bg-transparent border-b border-transparent hover:border-white/40 focus:border-white/40 px-2 py-0.5 transition-colors focus:outline-none"
            aria-label="Job name"
            title="Click to rename job"
          />
        )}
      </div>

      {/* Right cluster: Undo, Redo, Print, Save as PDF, Theme Toggle */}
      <div className="flex items-center gap-2">
        {!isStartScreen && (
          <>
            {/* Undo */}
            <Tooltip content="Undo (Ctrl+Z)">
              <button
                type="button"
                disabled={!hasUndo}
                onClick={() => undo(activeJobId)}
                aria-label="Undo"
                className="w-10 h-10 flex items-center justify-center rounded-[8px] text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              >
                <Undo2 className="w-5 h-5" />
              </button>
            </Tooltip>

            {/* Redo */}
            <Tooltip content="Redo (Ctrl+Y)">
              <button
                type="button"
                disabled={!hasRedo}
                onClick={() => redo(activeJobId)}
                aria-label="Redo"
                className="w-10 h-10 flex items-center justify-center rounded-[8px] text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              >
                <Redo2 className="w-5 h-5" />
              </button>
            </Tooltip>

            {/* Print Button (Solid Red) */}
            <button
              type="button"
              onClick={requestPrint}
              aria-label="Print job"
              className="h-10 px-5 rounded-[8px] bg-red hover:brightness-110 active:brightness-95 text-white font-medium text-[14px] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
            >
              Print
            </button>

            {/* Save as PDF Button (White text) */}
            <button
              type="button"
              onClick={requestExportPdf}
              aria-label="Save as PDF"
              className="h-10 px-4 rounded-[8px] text-white hover:bg-white/10 active:bg-white/20 font-medium text-[14px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
            >
              Save as PDF
            </button>
          </>
        )}

        {/* Settings Button (visible in both start and workspace states) */}
        <Tooltip content="Settings">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="w-10 h-10 flex items-center justify-center rounded-[8px] text-white hover:bg-white/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            <Settings className="w-5 h-5" />
          </button>
        </Tooltip>

        {/* Theme Toggle (both icons rendered with CSS switching driven by data-theme) */}
        <Tooltip content="Switch light or dark mode">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Switch light or dark mode"
            className="w-10 h-10 flex items-center justify-center rounded-[8px] text-white hover:bg-white/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            <Sun className="w-5 h-5 theme-icon-sun" />
            <Moon className="w-5 h-5 theme-icon-moon" />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
