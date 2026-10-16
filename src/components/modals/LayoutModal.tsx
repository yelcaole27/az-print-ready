'use client';

import React, { useMemo, useEffect } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';
import { useUiStore } from '@/store/useUiStore';
import { ModalShell } from './ModalShell';
import { getPageDimensionsMm } from '@/lib/pageGeometry';
import { collageOptions, CollageItem } from '@/lib/collageLayout';
import { finishMultiImport } from '@/lib/multiImportActions';

export function LayoutModal() {
  const multiImport = useUiStore((s) => s.multiImport);
  const setMultiImport = useUiStore((s) => s.setMultiImport);
  const discardAssets = useSessionStore((s) => s.discardAssets);
  const assets = useSessionStore((s) => s.assets);
  const jobs = useSessionStore((s) => s.jobs);
  const activeJobId = useSessionStore((s) => s.activeJobId);

  const assetMap = useMemo(() => {
    return new Map(assets.map((a) => [a.id, a]));
  }, [assets]);

  const activeJob = useMemo(() => {
    return jobs.find((j) => j.id === activeJobId) || jobs[0];
  }, [jobs, activeJobId]);

  const pagesNeedingLayout = useMemo(() => {
    if (!multiImport) return [];
    return multiImport.cards.filter((c) => c.assetIds.length >= 2);
  }, [multiImport]);

  const totalSteps = pagesNeedingLayout.length;
  const currentStep = multiImport?.layoutStepIndex ?? 0;
  const currentCard = pagesNeedingLayout[currentStep];

  // Paper geometry
  const templatePage = activeJob?.pages[0];
  const { wMm: pageWMm, hMm: pageHMm } = templatePage
    ? getPageDimensionsMm(templatePage)
    : { wMm: 215.9, hMm: 279.4 };
  const marginMm = activeJob?.settings.marginMm ?? 6.35;
  const gapMm = activeJob?.settings.gapMm ?? 2;

  // Options for the current card
  const options = useMemo(() => {
    if (!currentCard) return [];
    const items: CollageItem[] = [];
    for (const id of currentCard.assetIds) {
      const a = assetMap.get(id);
      if (a) {
        items.push({ assetId: a.id, pxW: a.pxW, pxH: a.pxH });
      }
    }
    return collageOptions(items, pageWMm, pageHMm, marginMm, gapMm);
  }, [currentCard, assetMap, pageWMm, pageHMm, marginMm, gapMm]);

  const chosenOptionId =
    currentCard && multiImport
      ? multiImport.chosenLayouts[currentCard.id] || 'best'
      : 'best';

  const handleCancel = React.useCallback(() => {
    if (!multiImport) return;
    if (!multiImport.isReAdd) {
      discardAssets(multiImport.batchAssetIds);
    }
    setMultiImport(null);
  }, [discardAssets, multiImport, setMultiImport]);

  const handleBack = React.useCallback(() => {
    if (currentStep > 0) {
      setMultiImport((prev) =>
        prev ? { ...prev, layoutStepIndex: currentStep - 1 } : null
      );
    } else {
      setMultiImport((prev) => (prev ? { ...prev, step: 'arrange' } : null));
    }
  }, [currentStep, setMultiImport]);

  const handleNextOrDone = React.useCallback(() => {
    if (!multiImport) return;
    if (currentStep < totalSteps - 1) {
      setMultiImport((prev) =>
        prev ? { ...prev, layoutStepIndex: currentStep + 1 } : null
      );
    } else {
      finishMultiImport(
        multiImport.cards,
        multiImport.chosenLayouts,
        multiImport.batchAssetIds
      );
    }
  }, [currentStep, totalSteps, multiImport, setMultiImport]);

  // Arrow keys and Enter navigation
  useEffect(() => {
    if (!multiImport || multiImport.step !== 'layout' || options.length === 0) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIdx = options.findIndex((o) => o.id === chosenOptionId);
        const nextIdx = (currentIdx + 1) % options.length;
        const nextOption = options[nextIdx];
        if (currentCard && nextOption) {
          setMultiImport((prev) =>
            prev
              ? {
                  ...prev,
                  chosenLayouts: {
                    ...prev.chosenLayouts,
                    [currentCard.id]: nextOption.id,
                  },
                }
              : null
          );
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIdx = options.findIndex((o) => o.id === chosenOptionId);
        const prevIdx = (currentIdx - 1 + options.length) % options.length;
        const prevOption = options[prevIdx];
        if (currentCard && prevOption) {
          setMultiImport((prev) =>
            prev
              ? {
                  ...prev,
                  chosenLayouts: {
                    ...prev.chosenLayouts,
                    [currentCard.id]: prevOption.id,
                  },
                }
              : null
          );
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleNextOrDone();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    multiImport,
    options,
    chosenOptionId,
    currentCard,
    handleNextOrDone,
    setMultiImport,
  ]);

  if (!multiImport || multiImport.step !== 'layout' || !currentCard) {
    return null;
  }

  const { cards } = multiImport;

  // Find 1-based page number in original cards
  const originalPageNumber =
    cards.findIndex((c) => c.id === currentCard.id) + 1;

  const handleSelectOption = (optId: 'best' | 'grid' | 'column' | 'row') => {
    setMultiImport((prev) =>
      prev
        ? {
            ...prev,
            chosenLayouts: {
              ...prev.chosenLayouts,
              [currentCard.id]: optId,
            },
          }
        : null
    );
  };

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
    <ModalShell titleId="layout-modal-title" onCancel={handleCancel}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 shrink-0">
        <div>
          <h2
            id="layout-modal-title"
            className="font-heading font-extrabold text-[34px] tracking-[-0.02em] leading-tight text-ink"
          >
            Choose a{' '}
            <span className="font-accent italic text-[40px] text-red font-normal">
              layout
            </span>
          </h2>
          <p className="text-[15px] text-muted mt-1">
            {currentCard.assetIds.length} pictures · {paperName}
          </p>
        </div>

        {totalSteps > 1 && (
          <div className="px-3.5 py-1.5 rounded-full bg-surface2 border border-line text-[13.5px] font-bold text-ink shrink-0">
            Page {currentStep + 1} of {totalSteps}
          </div>
        )}
      </div>

      {/* Body: 4 option cards in a row, wrapping on narrow screens */}
      <div className="flex-1 overflow-y-auto py-2 flex items-center justify-center">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">
          {options.map((option) => {
            const isSelected = option.id === chosenOptionId;
            const hint = OPTION_HINTS[option.id] || '';

            return (
              <div
                key={option.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectOption(option.id)}
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

                {/* Mini Letter paper preview (176x228, #FBFAF6, soft shadow) */}
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
                          src={asset.thumbUrl || asset.objectUrl}
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
            onClick={handleBack}
            className="h-[48px] px-6 rounded-[14px] border-[1.5px] border-line2 bg-transparent text-ink font-bold text-[16px] hover:border-blue hover:text-blue transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleNextOrDone}
            className="h-[48px] px-7 rounded-[14px] bg-red text-on-red font-bold text-[16px] flex items-center gap-2 hover:opacity-90 shadow-[0_8px_24px_-6px_rgba(244,112,103,0.55)] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            <span>{currentStep < totalSteps - 1 ? 'Next' : 'Done'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
