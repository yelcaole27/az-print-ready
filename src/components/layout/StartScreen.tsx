'use client';

import React, { useRef, useState } from 'react';
import { importFiles } from '@/lib/importImages';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';

export function StartScreen() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      importFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes('Files') ||
      e.dataTransfer.types.includes('application/x-azpr-asset')
    ) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const assetId = e.dataTransfer.getData('application/x-azpr-asset');
    if (assetId) {
      const { jobs, activeJobId, addBlocks } = useSessionStore.getState();
      const activeJob = jobs.find((j) => j.id === activeJobId) || jobs[0];
      if (activeJob) {
        const res = addBlocks(activeJob.id, [
          { kind: 'fit', assetIds: [assetId] },
        ]);
        if (res.ok) {
          const { setActiveAssetId, setActivePage, select } = useUiStore.getState();
          setActiveAssetId(assetId);
          if (res.firstPageId) {
            setActivePage(res.firstPageId);
            const updatedJob = useSessionStore
              .getState()
              .jobs.find((j) => j.id === activeJob.id);
            const page = updatedJob?.pages.find((p) => p.id === res.firstPageId);
            const el =
              page?.elements.find((item) => item.assetId === assetId) ||
              page?.elements[0];
            if (page && el) {
              select({ pageId: page.id, elementId: el.id });
            }
          }
        }
      }
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      importFiles(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <main
      className="relative flex-1 flex flex-col items-center justify-between py-5 px-6 select-none overflow-hidden min-h-0 bg-transparent"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* Four corner crop marks (L-shaped brackets, 24px arms, 1px stroke faint, 28px inside corners) */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        className="absolute top-[28px] left-[28px] pointer-events-none"
        aria-hidden="true"
      >
        <path d="M0 24 V0 H24" stroke="var(--color-faint)" strokeWidth="1" />
      </svg>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        className="absolute top-[28px] right-[28px] pointer-events-none"
        aria-hidden="true"
      >
        <path d="M24 24 V0 H0" stroke="var(--color-faint)" strokeWidth="1" />
      </svg>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        className="absolute bottom-[28px] left-[28px] pointer-events-none"
        aria-hidden="true"
      >
        <path d="M0 0 V24 H24" stroke="var(--color-faint)" strokeWidth="1" />
      </svg>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        className="absolute bottom-[28px] right-[28px] pointer-events-none"
        aria-hidden="true"
      >
        <path d="M24 0 V24 H0" stroke="var(--color-faint)" strokeWidth="1" />
      </svg>

      {/* Main Content Group */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 w-full max-w-[720px]">
        {/* Headline & Subline */}
        <div className="text-center">
          <h1 className="select-none leading-none tracking-[-0.03em] flex items-baseline justify-center">
            <span
              style={{ fontFamily: 'var(--font-bricolage), sans-serif' }}
              className="text-[72px] font-extrabold text-text"
            >
              Drop. Tap.&nbsp;
            </span>
            <span
              style={{ fontFamily: 'var(--font-instrument-serif), serif' }}
              className="text-[84px] font-normal italic text-red"
            >
              Print.
            </span>
          </h1>
          <p className="text-[18px] text-muted text-center mt-1.5 font-normal">
            Add your pictures. We make them ready for the printer.
          </p>
        </div>

        {/* Drop Zone Button */}
        <button
          type="button"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          aria-label="Upload or paste an image"
          className={`relative w-full h-[330px] rounded-[28px] border-2 border-dashed transition-all duration-150 ease-out cursor-pointer flex flex-col items-center justify-center p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue group ${
            isDragOver
              ? 'border-blue bg-blue-tint -translate-y-0.5 motion-reduce:transform-none'
              : 'border-line2 bg-surface hover:border-blue hover:bg-blue-tint hover:-translate-y-0.5 active:translate-y-0 motion-reduce:hover:transform-none'
          }`}
        >
          {/* Four Corner Registration Marks (14px circle with crosshair, inset 18px, clockwise: blue, red, yellow, green) */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="absolute top-[18px] left-[18px] pointer-events-none"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4" stroke="var(--color-blue)" strokeWidth="1" />
            <line x1="0" y1="7" x2="14" y2="7" stroke="var(--color-blue)" strokeWidth="1" />
            <line x1="7" y1="0" x2="7" y2="14" stroke="var(--color-blue)" strokeWidth="1" />
          </svg>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="absolute top-[18px] right-[18px] pointer-events-none"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4" stroke="var(--color-red)" strokeWidth="1" />
            <line x1="0" y1="7" x2="14" y2="7" stroke="var(--color-red)" strokeWidth="1" />
            <line x1="7" y1="0" x2="7" y2="14" stroke="var(--color-red)" strokeWidth="1" />
          </svg>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="absolute bottom-[18px] right-[18px] pointer-events-none"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4" stroke="var(--color-yellow)" strokeWidth="1" />
            <line x1="0" y1="7" x2="14" y2="7" stroke="var(--color-yellow)" strokeWidth="1" />
            <line x1="7" y1="0" x2="7" y2="14" stroke="var(--color-yellow)" strokeWidth="1" />
          </svg>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="absolute bottom-[18px] left-[18px] pointer-events-none"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4" stroke="var(--color-green)" strokeWidth="1" />
            <line x1="0" y1="7" x2="14" y2="7" stroke="var(--color-green)" strokeWidth="1" />
            <line x1="7" y1="0" x2="7" y2="14" stroke="var(--color-green)" strokeWidth="1" />
          </svg>

          {/* Stacked Papers Graphic */}
          <div className="relative w-[80px] h-[96px] mb-3 flex items-center justify-center">
            {/* Back Paper (tilted -6 deg) */}
            <div
              className="absolute w-[64px] h-[82px] rounded-[6px] bg-[#FBFAF6] border border-black/10 shadow-[0_4px_12px_rgba(0,0,0,0.08)] -rotate-6"
            />
            {/* Front Paper (tilted +4 deg) */}
            <div
              className="absolute w-[64px] h-[82px] rounded-[6px] bg-[#FBFAF6] border border-black/10 shadow-[0_8px_18px_rgba(0,0,0,0.12)] rotate-4 flex items-center justify-center"
            >
              {/* Red circle badge with white plus */}
              <div className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-red text-white flex items-center justify-center shadow-md">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <line x1="7" y1="2" x2="7" y2="12" />
                  <line x1="2" y1="7" x2="12" y2="7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Text inside Drop Zone */}
          <span
            style={{ fontFamily: 'var(--font-bricolage), sans-serif' }}
            className="font-extrabold text-[26px] text-text leading-tight"
          >
            Upload or paste an image
          </span>
          <span className="text-[15px] text-muted mt-1 font-normal">
            Drag here, click to browse, or press Ctrl+V
          </span>
        </button>

        {/* 3-Step Row */}
        <div className="flex items-center justify-center gap-2.5 flex-wrap">
          {/* Step 1 */}
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-[14px] bg-surface border border-line shadow-xs">
            <span className="w-[26px] h-[26px] rounded-full bg-blue text-on-blue flex items-center justify-center text-[13px] font-bold shrink-0">
              1
            </span>
            <span className="text-[15px] font-semibold text-text whitespace-nowrap">
              Drop pictures
            </span>
          </div>

          {/* Thin Arrow */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-muted shrink-0"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          {/* Step 2 */}
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-[14px] bg-surface border border-line shadow-xs">
            <span className="w-[26px] h-[26px] rounded-full bg-yellow text-[#17150F] flex items-center justify-center text-[13px] font-bold shrink-0">
              2
            </span>
            <span className="text-[15px] font-semibold text-text whitespace-nowrap">
              Tap a size
            </span>
          </div>

          {/* Thin Arrow */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-muted shrink-0"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          {/* Step 3 */}
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-[14px] bg-surface border border-line shadow-xs">
            <span className="w-[26px] h-[26px] rounded-full bg-red text-on-red flex items-center justify-center text-[13px] font-bold shrink-0">
              3
            </span>
            <span className="text-[15px] font-semibold text-text whitespace-nowrap">
              Print
            </span>
          </div>
        </div>
      </div>

      {/* Bottom 6px bar split into 4 equal bands at 60% opacity, 240px wide, centered, radius 3 */}
      <div className="h-[6px] w-[240px] rounded-[3px] overflow-hidden grid grid-cols-4 opacity-60 shrink-0 mt-3">
        <div className="bg-blue" />
        <div className="bg-red" />
        <div className="bg-yellow" />
        <div className="bg-green" />
      </div>
    </main>
  );
}
