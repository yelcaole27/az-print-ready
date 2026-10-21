'use client';

import React, { useState, useRef } from 'react';
import { Undo2, Redo2, Moon, Sun, Settings, Printer } from 'lucide-react';
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
    <header className="shrink-0 select-none z-30 bg-[#08090C] text-[#F3F0E9]">
      <div className="h-[56px] px-4 flex items-center justify-between">
        {/* Left: SVG registration mark + Brand Title */}
        <div className="flex items-center gap-2.5">
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="shrink-0"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6" stroke="#F47067" strokeWidth="1.5" />
            <line x1="1" y1="11" x2="21" y2="11" stroke="#F47067" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="11" y1="1" x2="11" y2="21" stroke="#F47067" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span
            className="font-extrabold text-[15px] uppercase tracking-[0.08em] text-[#F3F0E9]"
            style={{ fontFamily: 'var(--font-bricolage), sans-serif' }}
          >
            AZ PRINT READY
          </span>
        </div>

        {/* Center: Job name pill */}
        <div className="flex items-center justify-center flex-1 max-w-sm px-2">
          {activeJob && (
            <div className="h-[36px] w-full max-w-[280px] rounded-[12px] bg-white/[0.07] flex items-center px-3 hover:bg-white/[0.1] focus-within:bg-white/[0.1] focus-within:ring-1 focus-within:ring-[#69B7F7] transition-colors">
              <input
                ref={inputRef}
                type="text"
                maxLength={40}
                value={jobNameInput}
                onChange={(e) => setJobNameInput(e.target.value)}
                onBlur={handleCommitName}
                onKeyDown={handleKeyDown}
                placeholder="Untitled job"
                className="w-full text-center text-[14px] font-medium text-[#F3F0E9] bg-transparent focus:outline-none placeholder:text-white/40"
                aria-label="Job name"
                title="Click to rename job"
              />
            </div>
          )}
        </div>

        {/* Right cluster: Undo, Redo, Print, Save as PDF, Settings, Theme Toggle */}
        <div className="flex items-center gap-2">
          {(!isStartScreen || hasUndo) && (
            <>
              {/* Undo */}
              <Tooltip content="Undo (Ctrl+Z)">
                <button
                  type="button"
                  disabled={!hasUndo}
                  onClick={() => undo(activeJobId)}
                  aria-label="Undo"
                  className="w-10 h-10 flex items-center justify-center rounded-[12px] text-[#F3F0E9] hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#69B7F7]"
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
                  className="w-10 h-10 flex items-center justify-center rounded-[12px] text-[#F3F0E9] hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#69B7F7]"
                >
                  <Redo2 className="w-5 h-5" />
                </button>
              </Tooltip>
            </>
          )}

          {/* Print Button */}
          <button
            type="button"
            disabled={isStartScreen}
            onClick={requestPrint}
            aria-label="Print job"
            title={isStartScreen ? 'Add a picture first' : 'Print job'}
            style={isStartScreen ? undefined : { boxShadow: '0 8px 24px -6px rgba(244,112,103,.6)' }}
            className="h-[44px] px-5 rounded-[14px] bg-[#F47067] text-[#1E0B09] font-bold text-[16px] flex items-center gap-2 hover:brightness-110 active:brightness-95 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Printer className="w-5 h-5 shrink-0" />
            <span>Print</span>
          </button>

          {/* Save as PDF */}
          <button
            type="button"
            disabled={isStartScreen}
            onClick={requestExportPdf}
            aria-label="Save as PDF"
            title={isStartScreen ? 'Add a picture first' : 'Save as PDF'}
            className="h-[44px] px-4 rounded-[14px] border border-white/[0.22] bg-transparent text-[#F3F0E9] hover:bg-white/10 active:bg-white/20 font-medium text-[14px] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#69B7F7]"
          >
            Save as PDF
          </button>

          {/* Settings Button */}
          <Tooltip content="Settings">
            <button
              type="button"
              onClick={() => setSettingsOpen(true, 'general')}
              aria-label="Settings"
              className="w-10 h-10 flex items-center justify-center rounded-[12px] text-[#F3F0E9] hover:bg-white/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#69B7F7]"
            >
              <Settings className="w-5 h-5" />
            </button>
          </Tooltip>

          {/* Theme Toggle */}
          <Tooltip content="Switch light or dark mode">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Switch light or dark mode"
              className="w-10 h-10 flex items-center justify-center rounded-[12px] text-[#F3F0E9] hover:bg-white/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#69B7F7]"
            >
              <Sun className="w-5 h-5 theme-icon-sun" />
              <Moon className="w-5 h-5 theme-icon-moon" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* 3px bottom strip of 4 equal bands */}
      <div className="h-[3px] w-full grid grid-cols-4">
        <div className="bg-[#69B7F7]" />
        <div className="bg-[#F47067]" />
        <div className="bg-[#F5CF68]" />
        <div className="bg-[#6AD58C]" />
      </div>
    </header>
  );
}
