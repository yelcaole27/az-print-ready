'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { ModalShell } from './ModalShell';
import { getPageDimensionsMm } from '@/lib/pageGeometry';
import { collageOptions, CollageItem } from '@/lib/collageLayout';

export function ChangeLayoutModal() {
  const editingBlockLayoutId = useUiStore((s) => s.editingBlockLayoutId);
  const setEditingBlockLayoutId = useUiStore((s) => s.setEditingBlockLayoutId);
  const jobs = useSessionStore((s) => s.jobs);
  const activeJobId = useSessionStore((s) => s.activeJobId);
  const assets = useSessionStore((s) => s.assets);
  const updateBlock = useSessionStore((s) => s.updateBlock);

  const activeJob = useMemo(() => {
    return jobs.find((j) => j.id === activeJobId) || jobs[0];
  }, [jobs, activeJobId]);

  const block = useMemo(() => {
    if (!activeJob || !editingBlockLayoutId) return null;
    return activeJob.blocks.find((b) => b.id === editingBlockLayoutId) || null;
  }, [activeJob, editingBlockLayoutId]);

  const [userChoice, setUserChoice] = useState<'best' | 'grid' | 'column' | 'row' | null>(null);
  const selectedLayout = userChoice ?? block?.collageOption ?? 'best';

  const assetMap = useMemo(() => {
    return new Map(assets.map((a) => [a.id, a]));
  }, [assets]);

  const templatePage = activeJob?.pages[0];
  const { wMm: pageWMm, hMm: pageHMm } = templatePage
    ? getPageDimensionsMm(templatePage)
    : { wMm: 215.9, hMm: 279.4 };
  const effectiveMargin = activeJob?.settings.borderless ? 0 : (activeJob?.settings.marginMm ?? 6.35);
  const gapMm = activeJob?.settings.gapMm ?? 2;

  const options = useMemo(() => {
    if (!block || block.kind !== 'collage') return [];
    const items: CollageItem[] = [];
    for (const id of block.assetIds) {
      const a = assetMap.get(id);
      if (a) {
        items.push({ assetId: a.id, pxW: a.pxW, pxH: a.pxH });
      }
    }
    return collageOptions(items, pageWMm, pageHMm, effectiveMargin, gapMm);
  }, [block, assetMap, pageWMm, pageHMm, effectiveMargin, gapMm]);

  const handleCancel = React.useCallback(() => {
    setUserChoice(null);
    setEditingBlockLayoutId(null);
  }, [setEditingBlockLayoutId]);

  const handleApply = React.useCallback(() => {
    if (!activeJob || !block) return;
    updateBlock(activeJob.id, block.id, { collageOption: selectedLayout });
    setUserChoice(null);
    setEditingBlockLayoutId(null);
  }, [activeJob, block, selectedLayout, updateBlock, setEditingBlockLayoutId]);

  useEffect(() => {
    if (!editingBlockLayoutId || !block || options.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIdx = options.findIndex((o) => o.id === selectedLayout);
        const nextIdx = (currentIdx + 1) % options.length;
        const nextOption = options[nextIdx];
        if (nextOption) {
          setUserChoice(nextOption.id);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIdx = options.findIndex((o) => o.id === selectedLayout);
        const prevIdx = (currentIdx - 1 + options.length) % options.length;
        const prevOption = options[prevIdx];
        if (prevOption) {
          setUserChoice(prevOption.id);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleApply();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingBlockLayoutId, block, options, selectedLayout, handleApply]);

  if (!editingBlockLayoutId || !block || block.kind !== 'collage') {
    return null;
  }

  // Mini preview dimensions: 176x228
  const previewW = 176;
  const previewH = 228;
  const scaleX = previewW / pageWMm;
  const scaleY = previewH / pageHMm;

  const paperName = templatePage?.paperId
    ? templatePage.paperId.charAt(0).toUpperCase() + templatePage.paperId.slice(1)
    : 'Letter';

  const OPTION_HINTS: Record<string, string> = {
    best: 'Biggest pictures',
    grid: 'Even boxes',
    column: 'Stacked',
    row: 'Side by side',
  };

  return (
    <ModalShell titleId="change-layout-modal-title" onCancel={handleCancel}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 shrink-0">
        <div>
          <h2
            id="change-layout-modal-title"
            className="font-heading font-extrabold text-[34px] tracking-[-0.02em] leading-tight text-ink"
          >
            Change{' '}
            <span className="font-accent italic text-[40px] text-red font-normal">
              layout
            </span>
          </h2>
          <p className="text-[15px] text-muted mt-1">
            {block.assetIds.length} pictures · {paperName}
          </p>
        </div>
      </div>

      {/* Body: 4 option cards in a row */}
      <div className="flex-1 overflow-y-auto py-2 flex items-center justify-center">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">
          {options.map((option) => {
            const isSelected = option.id === selectedLayout;
            const hint = OPTION_HINTS[option.id] || '';

            return (
              <div
                key={option.id}
                role="button"
                tabIndex={0}
                onClick={() => setUserChoice(option.id)}
                onDoubleClick={handleApply}
                className={`rounded-[22px] p-4 pb-[18px] border-2 bg-surface2 flex flex-col items-center cursor-pointer transition-all relative select-none ${
                  isSelected
                    ? 'border-blue bg-blue-tint'
                    : 'border-line hover:border-line2'
                }`}
              >
                {/* 26px blue circle check badge when selected */}
                {isSelected && (
                  <div
                    aria-label="Selected"
                    className="absolute top-3 right-3 w-[26px] h-[26px] rounded-full bg-blue text-white flex items-center justify-center shadow-xs"
                  >
                    <Check className="w-4 h-4 stroke-[2.5]" />
                  </div>
                )}

                {/* Mini paper preview (176x228, #FBFAF6, soft shadow) */}
                <div
                  style={{ width: `${previewW}px`, height: `${previewH}px` }}
                  className="relative bg-[#FBFAF6] border border-line rounded-[4px] shadow-sm overflow-hidden shrink-0"
                >
                  {option.items.map((placed, pIdx) => {
                    const asset = assetMap.get(placed.assetId);
                    if (!asset) return null;

                    return (
                      <div
                        key={placed.assetId + pIdx}
                        style={{
                          position: 'absolute',
                          left: `${placed.xMm * scaleX}px`,
                          top: `${placed.yMm * scaleY}px`,
                          width: `${placed.wMm * scaleX}px`,
                          height: `${placed.hMm * scaleY}px`,
                        }}
                      >
                        <img
                          src={asset.objectUrl}
                          alt=""
                          draggable={false}
                          className="w-full h-full object-cover block select-none pointer-events-none"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Option Name & Hint */}
                <span className="font-heading font-extrabold text-[18px] text-ink mt-3.5 text-center leading-tight">
                  {option.label}
                </span>
                <span className="text-[13px] text-muted mt-0.5 text-center leading-tight">
                  {hint}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-5 border-t border-line flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-[14px] text-muted select-none">
          <Check className="w-4 h-4 text-green stroke-[2.5]" />
          <span>Nothing is cropped or stretched</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="h-[48px] px-6 rounded-[14px] border-[1.5px] border-line2 bg-transparent text-ink font-bold text-[16px] hover:border-blue hover:text-blue transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="h-[48px] px-7 rounded-[14px] bg-red text-on-red font-bold text-[16px] flex items-center gap-2 hover:opacity-90 shadow-[0_8px_24px_-6px_rgba(244,112,103,0.55)] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            <span>Done</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
