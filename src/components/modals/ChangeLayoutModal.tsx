'use client';

import React, { useMemo, useState, useEffect } from 'react';
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

  const previewW = 200;
  const previewH = Math.round(previewW * (pageHMm / pageWMm));
  const scale = previewW / pageWMm;

  return (
    <ModalShell titleId="change-layout-modal-title" onCancel={handleCancel}>
      <div className="mb-6">
        <h2
          id="change-layout-modal-title"
          className="text-[20px] font-semibold text-ink leading-tight"
        >
          Change layout
        </h2>
        <p className="text-[14px] text-muted mt-1">
          Pick how pictures are arranged on this page.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto py-2 flex items-center justify-center min-h-[300px]">
        <div className="grid grid-cols-2 gap-6 max-w-[500px]">
          {options.map((option) => {
            const isSelected = option.id === selectedLayout;

            return (
              <div
                key={option.id}
                role="button"
                tabIndex={0}
                onClick={() => setUserChoice(option.id)}
                onDoubleClick={handleApply}
                className={`p-3 rounded-[12px] bg-surface flex flex-col items-center cursor-pointer transition-all relative ${
                  isSelected
                    ? 'border-2 border-blue shadow-sm'
                    : 'border border-line hover:border-blue'
                }`}
              >
                {isSelected && (
                  <div
                    aria-label="Selected"
                    className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue text-white flex items-center justify-center text-xs"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-3.5 h-3.5"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}

                <div
                  style={{ width: `${previewW}px`, height: `${previewH}px` }}
                  className="relative bg-white border border-line rounded-[2px] shadow-xs overflow-hidden"
                >
                  {option.items.map((placed, pIdx) => {
                    const asset = assetMap.get(placed.assetId);
                    if (!asset) return null;

                    return (
                      <div
                        key={placed.assetId + pIdx}
                        style={{
                          position: 'absolute',
                          left: `${placed.xMm * scale}px`,
                          top: `${placed.yMm * scale}px`,
                          width: `${placed.wMm * scale}px`,
                          height: `${placed.hMm * scale}px`,
                        }}
                      >
                        <img
                          src={asset.objectUrl}
                          alt=""
                          draggable={false}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'fill',
                          }}
                          className="block select-none pointer-events-none"
                        />
                      </div>
                    );
                  })}
                </div>

                <span className="text-[14px] font-medium text-ink mt-2.5 select-none">
                  {option.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-line flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleCancel}
          className="h-[40px] px-5 rounded-[8px] border border-line bg-paper text-ink hover:border-blue hover:text-blue transition-colors text-[14px] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="h-[40px] px-6 rounded-[8px] bg-blue-strong text-white hover:bg-blue-strong/90 transition-colors text-[14px] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
        >
          Done
        </button>
      </div>
    </ModalShell>
  );
}
